import AgileTaskNotesPlugin, { AgileTaskNotesPluginSettingTab, AgileTaskNotesSettings } from 'main';
import { normalizePath, requestUrl, Setting, TFile, RequestUrlResponse } from 'obsidian';
import { Task } from 'src/Task';
import { VaultHelper } from 'src/VaultHelper'
import { ITfsClient } from './ITfsClient';

export interface JiraSettings {
  baseUrl: string,
  name: string,
  email: string,
  authmode: string,
  apiToken: string,
  boardId: string,
  useSprintName: boolean,
  mode: string,
  columnsActive: string,
  columnsFinal: string
}

export const JIRA_DEFAULT_SETTINGS: JiraSettings = {
  baseUrl: '{yourserver}.atlassian.net',
	name: '',
  email: '',
  authmode: 'basic',
  apiToken: '',
  boardId: '',
  useSprintName: true,
  mode: 'sprints',
  columnsActive: 'In Progress',
  columnsFinal: 'Done,Won\'t do'
}

export class JiraClient implements ITfsClient{
  
  clientName: string = 'Jira';

  public async update(settings: AgileTaskNotesSettings): Promise<void> {

    var headers = {
      "Authorization": '',
      "Content-Type": "application/json"
    }
    if(settings.jiraSettings.authmode == 'basic') {
        const encoded64Key = Buffer.from(`${settings.jiraSettings.email}:${settings.jiraSettings.apiToken}`).toString("base64");
        headers.Authorization = `Basic ${encoded64Key}`
    } else if(settings.jiraSettings.authmode = 'bearer') {
        headers.Authorization = `Bearer ${settings.jiraSettings.apiToken}`
    } 

    const BaseURL = `https://${settings.jiraSettings.baseUrl}/rest/agile/1.0`;

    try {
      if (settings.jiraSettings.mode == 'sprints') {
        const sprintsResponse = await requestUrl({ method: 'GET', headers: headers, url: `${BaseURL}/board/${settings.jiraSettings.boardId}/sprint?state=active` })
        const currentSprintId = sprintsResponse.json.values[0].id 
        const currentSprintName = sprintsResponse.json.values[0].name
          .replace(/Sprint/, '')
          .replace(/Board/, '')
          .replace(/^\s+|\s+$/g, '')
          .replace(/[^a-zA-Z0-9 -]/g, '')
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-')
      
        const sprintIdentifier = settings.jiraSettings.useSprintName ? currentSprintName : currentSprintId
        const issuesResponse = await requestUrl({ method: 'GET', headers: headers, url: `${BaseURL}/board/${settings.jiraSettings.boardId}/sprint/${currentSprintId}/issue?jql=assignee=\"${settings.jiraSettings.name}\"` });

        const assignedIssuesInSprint = issuesResponse.json.issues;

        const normalizedFolderPath =  normalizePath(settings.targetFolder + '/sprint-' + sprintIdentifier);

        // Ensure folder structure created
        VaultHelper.createFolders(normalizedFolderPath);

        let tasks:Array<Task> = [];
        assignedIssuesInSprint.forEach((task:any) => {
          tasks.push(new Task(task.key, task.fields["status"]["name"], task.fields["summary"], task.fields["issuetype"]["name"], task.fields["assignee"]["displayName"], `https://${settings.jiraSettings.baseUrl}/browse/${task.key}`, task.fields["description"]));
        });

        // Create markdown files based on remote task in current sprint
        await Promise.all(VaultHelper.createTaskNotes(normalizedFolderPath, tasks, settings.noteTemplate));
        
        if (settings.createKanban) {
          
          // Get the column names from the Jira board
          const boardConfigResponse = await requestUrl({ method: 'GET', headers: headers, url: `${BaseURL}/board/${settings.jiraSettings.boardId}/configuration` })
          const columnIds = boardConfigResponse.json.columnConfig.columns.map((column:any) => column.name);

          // Create or replace Kanban board of current sprint
          await VaultHelper.createKanbanBoard(normalizedFolderPath, tasks, columnIds, sprintIdentifier);
        }

      } else if(settings.jiraSettings.mode == 'kanban') {

        const activeColsQueryString = "(" + settings.jiraSettings.columnsActive.split(',').map(s => `\"${s.trim()}\"`).join(',') + ")";
        const finalColsQueryString = `(${settings.jiraSettings.columnsFinal.split(',').map(s => `\"${s.trim()}\"`).join(',')})`;
        const queryIssues = async (issueQueryString: string): Promise<RequestUrlResponse>  => { 
          return await requestUrl(
            { 
              method: 'GET',
              headers: headers,
              url: `${BaseURL}/board/${settings.jiraSettings.boardId}/issue?jql=assignee=\"${settings.jiraSettings.name}\" and status in ${issueQueryString}&maxResults=1000`
            }
          )
        };
        const activeIssuesRes = await queryIssues(activeColsQueryString);
        const finalIssuesRes = await queryIssues(finalColsQueryString);
        const assignedActiveIssues = activeIssuesRes.json.issues;
        const assignedFinalIssues = finalIssuesRes.json.issues;
  
        const finalFolder = settings.targetFolder + '/Final/';
        const normalizedBaseFolderPath =  normalizePath(settings.targetFolder);
        const normalizedFinalfolderPath = normalizePath(finalFolder);

        // Ensure folder structures created
        VaultHelper.createFoldersFromList([normalizedBaseFolderPath, normalizedFinalfolderPath]);

        const createTaskArray = (issueList:any): Array<Task> => { 
          return issueList.map((issue:any) => {
            return new Task(issue.key, issue.fields["status"]["name"], issue.fields["summary"], issue.fields["issuetype"]["name"], issue.fields["assignee"]["displayName"], `https://${settings.jiraSettings.baseUrl}/browse/${issue.key}`, issue.fields["description"])
          });
        };

        const activeTasks = createTaskArray(assignedActiveIssues);
        const finalTasks = createTaskArray(assignedFinalIssues);
  
        // Create markdown files
        await Promise.all(VaultHelper.createTaskNotes(normalizedBaseFolderPath, activeTasks, settings.noteTemplate));
        await Promise.all(VaultHelper.createTaskNotes(normalizedFinalfolderPath, finalTasks, settings.noteTemplate));

        // Move pre-existing notes that became final state into the Final folder
        const finalTaskNoteFiles = finalTasks.map(task => VaultHelper.getAbstractFileByTaskId(settings.targetFolder, task.id)).filter((file): file is TFile => !!file);
        finalTaskNoteFiles.forEach(file => app.vault.rename(file, normalizePath(settings.targetFolder + '/Final/' + file.name)));

        if (settings.createKanban) {
          
          // Get the column names from the Jira board
          const boardConfigResponse = await requestUrl({ method: 'GET', headers: headers, url: `${BaseURL}/board/${settings.jiraSettings.boardId}/configuration` })
          const columnIds = boardConfigResponse.json.columnConfig.columns.map((column:any) => column.name);

          // Create or replace Kanban board of current sprint
          await VaultHelper.createKanbanBoard(normalizedBaseFolderPath, activeTasks.concat(finalTasks), columnIds, settings.jiraSettings.boardId);
        }
      }
    } catch(e) {
      VaultHelper.logError(e);
    }
  }

  public setupSettings(container: HTMLElement, plugin: AgileTaskNotesPlugin, settingsTab: AgileTaskNotesPluginSettingTab): any {
    container.createEl('h2', {text: 'Jira Remote Repo Settings'});

    new Setting(container)
			.setName('URL')
			.setDesc('The base URL of your Jira server or {ip:port}')
			.addText(text => text
				.setPlaceholder('Enter Jira base URL')
				.setValue(plugin.settings.jiraSettings.baseUrl)
				.onChange(async (value) => {
					plugin.settings.jiraSettings.baseUrl = value;
					await plugin.saveSettings();
				}));

    new Setting(container)
      .setName('Name')
      .setDesc('Your first and last name space separated that is used on Jira')
      .addText(text => text
        .setPlaceholder('Enter first and last name')
        .setValue(plugin.settings.jiraSettings.name)
        .onChange(async (value) => {
          plugin.settings.jiraSettings.name = value;
          await plugin.saveSettings();
        }));

    new Setting(container)
			.setName('Email')
			.setDesc('The email of your Atlassian account for Jira')
			.addText(text => text
				.setPlaceholder('Enter Atlassian email')
				.setValue(plugin.settings.jiraSettings.email)
				.onChange(async (value) => {
					plugin.settings.jiraSettings.email = value;
					await plugin.saveSettings();
				}));

    new Setting(container)
      .setName('Authorization mode')
      .setDesc('Set the mode of authorization to be used')
      .addDropdown((dropdown) => {
        dropdown.addOption("basic", "Basic Auth");
        dropdown.addOption("bearer", "Personal Access Token");
        dropdown.setValue(plugin.settings.jiraSettings.authmode)
          .onChange(async (value) => {
            plugin.settings.jiraSettings.authmode = value;
            await plugin.saveSettings();
          });
      });

    new Setting(container)
      .setName('API Token')
      .setDesc('The API token generated with your account')
      .addText(text => text
        .setPlaceholder('Enter API token')
        .setValue(plugin.settings.jiraSettings.apiToken)
        .onChange(async (value) => {
          plugin.settings.jiraSettings.apiToken = value;
          await plugin.saveSettings();
        }));

    new Setting(container)
      .setName('Mode')
      .setDesc('Set the mode corresponding to how you use Jira')
      .addDropdown((dropdown) => {
        dropdown.addOption("sprints", "Sprints");
        dropdown.addOption("kanban", "Kanban");
        dropdown.setValue(plugin.settings.jiraSettings.mode)
          .onChange(async (value) => {
            plugin.settings.jiraSettings.mode = value;
            await plugin.saveSettings();
            settingsTab.display()
          });
      });

    if (plugin.settings.jiraSettings.mode == 'sprints') {
      new Setting(container)
        .setName('Use Sprint Name (rather than id)')
        .setDesc("Uses the Sprint's human assigned name")
        .addToggle(text => text
          .setValue(plugin.settings.jiraSettings.useSprintName)
            .onChange(async (value) => {
            plugin.settings.jiraSettings.useSprintName = value;
            await plugin.saveSettings();
          }));
    } else if (plugin.settings.jiraSettings.mode == 'kanban') {
      new Setting(container)
        .setName('Working Column Names')
        .setDesc('Comma-separated list of column key names to be used to create notes')
        .addText(text => text
          .setPlaceholder('Enter comma-seperated list')
          .setValue(plugin.settings.jiraSettings.columnsActive)
          .onChange(async (value) => {
            plugin.settings.jiraSettings.columnsActive = value;
            await plugin.saveSettings();
          }));

      new Setting(container)
        .setName('Final Column Names')
        .setDesc('Comma-separated list of column key names to be used to move notes to final')
        .addText(text => text
          .setPlaceholder('Enter comma-seperated list')
          .setValue(plugin.settings.jiraSettings.columnsFinal)
          .onChange(async (value) => {
            plugin.settings.jiraSettings.columnsFinal = value;
            await plugin.saveSettings();
          }));
    }

    new Setting(container)
      .setName('Board ID')
      .setDesc('The ID of your Scrum board (the number in the URL when viewing scrum board in browser) ')
      .addText(text => text
        .setPlaceholder('Enter Board ID')
        .setValue(plugin.settings.jiraSettings.boardId)
        .onChange(async (value) => {
          plugin.settings.jiraSettings.boardId = value;
          await plugin.saveSettings();
        }));
  }
}
