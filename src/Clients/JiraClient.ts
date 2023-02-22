import AgileTaskNotesPlugin, { AgileTaskNotesSettings } from 'main';
import { normalizePath, requestUrl, Setting, RequestUrlResponse } from 'obsidian';
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
  useSprintName: boolean
}

export const JIRA_DEFAULT_SETTINGS: JiraSettings = {
  baseUrl: '{yourserver}.atlassian.net',
	usernames: '',
  email: '',
  authmode: 'basic',
  apiToken: '',
  boardId: '',
  useSprintName: true,
}

export class JiraClient implements ITfsClient{
  
  clientName: string = 'Jira';

  public async updateCurrentSprint(settings: AgileTaskNotesSettings): Promise<void> {

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

      // Ensure folder structure created
      const normalizedFolderPath =  normalizePath(settings.targetFolder + '/sprint-' + sprintIdentifier);
      VaultHelper.createFolders(normalizedFolderPath);

      let tasks:Array<Task> = [];
      let usernames = settings.jiraSettings.usernames.split(',').map((username:string) => username.trim().replace("\'", "\\'"));

      const issueResponseList = await Promise.all(usernames.map((username: string) => 
        requestUrl({ method: 'GET', headers: headers, url: `${BaseURL}/board/${settings.jiraSettings.boardId}/sprint/${currentSprintId}/issue?jql=assignee=\"${username}\"` })
      ));
      
      issueResponseList.forEach((issueResponse: any) => {
        issueResponse.json.issues.forEach((issue:any) => {
          tasks.push(new Task(issue.key, issue.fields["status"]["name"], issue.fields["summary"], issue.fields["issuetype"]["name"], issue.fields["assignee"]["displayName"], `https://${settings.jiraSettings.baseUrl}/browse/${issue.key}`, issue.fields["description"]));
        });
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

    } catch(e) {
      VaultHelper.logError(e);
    }
  }

  public setupSettings(container: HTMLElement, plugin: AgileTaskNotesPlugin): any {
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
      .setName('Use Sprint Name (rather than id)')
      .setDesc("Uses the Sprint's human assigned name")
      .addToggle(text => text
        .setValue(plugin.settings.jiraSettings.useSprintName)
          .onChange(async (value) => {
          plugin.settings.jiraSettings.useSprintName = value;
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
  }
}
