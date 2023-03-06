import AgileTaskNotesPlugin, { AgileTaskNotesPluginSettingTab, AgileTaskNotesSettings } from 'main';
import { normalizePath, requestUrl, Setting, TFile } from 'obsidian';
import { Task } from 'src/Task';
import { VaultHelper } from 'src/VaultHelper'
import { ITfsClient } from './ITfsClient';

export interface JiraSettings {
  baseUrl: string,
  usernames: string,
  email: string,
  authmode: string,
  apiToken: string,
  boardId: string,
  useSprintName: boolean,
  mode: string,
  excludeBacklog: boolean
}

export const JIRA_DEFAULT_SETTINGS: JiraSettings = {
  baseUrl: '{yourserver}.atlassian.net',
	usernames: '',
  email: '',
  authmode: 'basic',
  apiToken: '',
  boardId: '',
  useSprintName: true,
  mode: 'sprints',
  excludeBacklog: false
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
        headers.Authorization = `Basic ${encoded64Key}`;
    } else if(settings.jiraSettings.authmode = 'bearer') {
        headers.Authorization = `Bearer ${settings.jiraSettings.apiToken}`;
    } 

    const BaseURL = `https://${settings.jiraSettings.baseUrl}/rest/agile/1.0`;

    try {
      if (settings.jiraSettings.mode == 'sprints') {
        const sprintsResponse = await requestUrl({ method: 'GET', headers: headers, url: `${BaseURL}/board/${settings.jiraSettings.boardId}/sprint?state=active` });
        const currentSprintId = sprintsResponse.json.values[0].id;
        const currentSprintName = sprintsResponse.json.values[0].name
          .replace(/Sprint/, '')
          .replace(/Board/, '')
          .replace(/^\s+|\s+$/g, '')
          .replace(/[^a-zA-Z0-9 -]/g, '')
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-');
      
        const sprintIdentifier = settings.jiraSettings.useSprintName ? currentSprintName : currentSprintId;
        const issuesResponse = await requestUrl(
          { 
            method: 'GET', 
            headers: headers, 
            url: `${BaseURL}/board/${settings.jiraSettings.boardId}/sprint/${currentSprintId}/issue?jql=assignee=\"${settings.jiraSettings.name}\"&maxResults=1000` 
          }
        );

        const assignedIssuesInSprint = issuesResponse.json.issues;

        const normalizedFolderPath =  normalizePath(settings.targetFolder + '/sprint-' + sprintIdentifier);

        // Ensure folder structure created
        VaultHelper.createFolders(normalizedFolderPath);

      let tasks:Array<Task> = [];
      let usernames = settings.jiraSettings.usernames.split(',').map((username:string) => username.trim().replace("\'", "\\'"));

      const issueResponseList = await Promise.all(usernames.map((username: string) => 
        requestUrl({ method: 'GET', headers: headers, url: `${BaseURL}/board/${settings.jiraSettings.boardId}/sprint/${currentSprintId}/issue?jql=assignee=\"${username}\"` })
      ));
      
      issueResponseList.forEach((issueResponse: any) => {
        issueResponse.json.issues.forEach((issue:any) => {
          tasks.push(new Task(
            task.key, 
            task.fields["status"]["name"], 
            task.fields["summary"], 
            task.fields["issuetype"]["name"], 
            task.fields["assignee"]["displayName"], 
            `https://${settings.jiraSettings.baseUrl}/browse/${task.key}`, 
            task.fields["description"])
          );
        });

        // Create markdown files based on remote task in current sprint
        await Promise.all(VaultHelper.createTaskNotes(normalizedFolderPath, tasks, settings.noteTemplate));
        
        if (settings.createKanban) {
          
          // Get the column names from the Jira board
          const boardConfigResponse = await requestUrl(
            { 
              method: 'GET', 
              headers: headers, 
              url: `${BaseURL}/board/${settings.jiraSettings.boardId}/configuration` 
            }
          );
          const columnIds = boardConfigResponse.json.columnConfig.columns.map((column:any) => column.name);

          await VaultHelper.createKanbanBoard(normalizedFolderPath, tasks, columnIds, sprintIdentifier);
        }

      } else if(settings.jiraSettings.mode == 'kanban') {

        const completedFolder = settings.targetFolder + '/Completed/';
        const normalizedBaseFolderPath =  normalizePath(settings.targetFolder);
        const normalizedCompletedfolderPath = normalizePath(completedFolder);

        // Ensure folder structures created
        VaultHelper.createFoldersFromList([normalizedBaseFolderPath, normalizedCompletedfolderPath]);

        const issuesResponse = await requestUrl(
          { 
            method: 'GET',
            headers: headers,
            url: `${BaseURL}/board/${settings.jiraSettings.boardId}/issue?jql=assignee=\"${settings.jiraSettings.name}\"&maxResults=1000`
          }
        );

        const assignedIssues = issuesResponse.json.issues;
  
        let activeTasks: Array<Task> = [];
        let completedTasks: Array<Task> = [];

        assignedIssues.forEach((task:any) => {
          if (!settings.jiraSettings.excludeBacklog || settings.jiraSettings.excludeBacklog && task.fields["status"]["name"] !== 'Backlog') {
            let taskObj = new Task(
                task.key, 
                task.fields["status"]["name"], 
                task.fields["summary"], 
                task.fields["issuetype"]["name"], 
                task.fields["assignee"]["displayName"], 
                `https://${settings.jiraSettings.baseUrl}/browse/${task.key}`, 
                task.fields["description"]
            );

            if (task.fields["resolution"] != null) {
              completedTasks.push(taskObj);
            } else {
              activeTasks.push(taskObj);
            }
          }
        });
        
        // Create markdown files
        await Promise.all(VaultHelper.createTaskNotes(normalizedBaseFolderPath, activeTasks, settings.noteTemplate));
        await Promise.all(VaultHelper.createTaskNotes(normalizedCompletedfolderPath, completedTasks, settings.noteTemplate));
        
        // Move pre-existing notes that became resolved state into the Completed folder and vise versa
        const completedTaskNoteFiles = completedTasks.map(task => VaultHelper.getFileByTaskId(settings.targetFolder, task.id)).filter((file): file is TFile => !!file);
        completedTaskNoteFiles.forEach(file => app.vault.rename(file, normalizePath(completedFolder + file.name)));
        const activeTaskNoteFiles = activeTasks.map(task => VaultHelper.getFileByTaskId(settings.targetFolder, task.id)).filter((file): file is TFile => !!file);
        activeTaskNoteFiles.forEach(file => app.vault.rename(file, normalizePath(settings.targetFolder + '/' + file.name)));

        if (settings.createKanban) {

          // Get the column names from the Jira board
          const boardConfigResponse = await requestUrl(
            { 
              method: 'GET', 
              headers: headers, 
              url: `${BaseURL}/board/${settings.jiraSettings.boardId}/configuration` 
            }
          );
          var columnIds = boardConfigResponse.json.columnConfig.columns.map((column:any) => column.name);

          if (settings.jiraSettings.excludeBacklog) {
            columnIds = columnIds.filter((columnName:string) => columnName !== 'Backlog');
          }

          await VaultHelper.createKanbanBoard(normalizedBaseFolderPath, activeTasks.concat(completedTasks), columnIds, settings.jiraSettings.boardId);
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
      .setName('Usernames')
      .setDesc('A comma-separated list of usernames you want the tasks of. Simply put your username if you only need your own.')
      .addText(text => text
        .setPlaceholder('Enter usernames')
        .setValue(plugin.settings.jiraSettings.usernames)
        .onChange(async (value) => {
          plugin.settings.jiraSettings.usernames = value;
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
    .setName('Board ID')
    .setDesc('The ID of your Scrum board (the number in the URL when viewing scrum board in browser) ')
    .addText(text => text
      .setPlaceholder('Enter Board ID')
      .setValue(plugin.settings.jiraSettings.boardId)
      .onChange(async (value) => {
        plugin.settings.jiraSettings.boardId = value;
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
            settingsTab.display() // Refresh settings to update view
          });
      });

    if (plugin.settings.jiraSettings.mode === 'sprints') {
      new Setting(container)
        .setName('Use Sprint Name (rather than id)')
        .setDesc("Uses the Sprint's human assigned name")
        .addToggle(text => text
          .setValue(plugin.settings.jiraSettings.useSprintName)
            .onChange(async (value) => {
            plugin.settings.jiraSettings.useSprintName = value;
            await plugin.saveSettings();
          }));
    } else if (plugin.settings.jiraSettings.mode === 'kanban') {
      new Setting(container)
      .setName('Exclude Backlog')
      .setDesc('Enable to prevent creation of issues from the backlog')
      .addToggle(toggle => toggle
        .setValue(plugin.settings.jiraSettings.excludeBacklog)
        .onChange(async (value) => {
          plugin.settings.jiraSettings.excludeBacklog = value
          await plugin.saveSettings();
        }));
    }
  }
}
