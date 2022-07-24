import AgileTaskNotesPlugin from 'main';
import { normalizePath, requestUrl, Setting, TFile } from 'obsidian';
import { VaultHelper } from 'src/VaultHelper'
import { ITfsClient } from './ITfsClient';

export interface JiraSettings {
  baseUrl: string,
  name: string,
  email: string,
  apiToken: string,
  boardId: string
}

export const JIRA_DEFAULT_SETTINGS: JiraSettings = {
  baseUrl: '{yourserver}.atlassian.net',
	name: '',
  email: '',
  apiToken: '',
  boardId: ''
}

const TASK_TEMPLATE_MD: string = "# {0}\n#{1}\n\nLink: {2}\n\n#todo:\n- [ ] Create todo list\n- [ ] \n\n## Notes:\n"; // Title, Tags

const JQL_QUERY: string = "assignee=\"{0}\"";

export class JiraClient implements ITfsClient{
  
  clientName: string = 'Jira';

  public async updateCurrentSprint(settings: any): Promise<void> {

    var encoded64Key = Buffer.from(`${settings.jiraSettings.email}:${settings.jiraSettings.apiToken}`).toString("base64");

    const headers = {
      "Authorization": `Basic ${encoded64Key}`,
      "Content-Type": "application/json"
    }

    const BaseURL = `https://${settings.jiraSettings.baseUrl}/rest/agile/1.0`;

    try {
      var sprintsResponse = await requestUrl({ method: 'GET', headers: headers, url: `${BaseURL}/board/${settings.jiraSettings.boardId}/sprint` });

      var currentSprintId = sprintsResponse.json.values.filter((sprint:any) => sprint.state === 'active')[0].id;
      
      var issuesResponse = await requestUrl({ method: 'GET', headers: headers, url: `${BaseURL}/board/${settings.jiraSettings.boardId}/sprint/${currentSprintId}/issue?jql=assignee=\"${settings.jiraSettings.name}\"` });

      var assignedIssuesInSprint = issuesResponse.json.issues;

      var normalizedFolderPath =  normalizePath(settings.targetFolder + '/sprint-' + currentSprintId);

      // Ensure folder structure created
      VaultHelper.createFolders(normalizedFolderPath);

      // Create markdown files based on remote task in current sprint
      var promisesToCreateNotes: Promise<TFile>[] = [];
      assignedIssuesInSprint.forEach((task:any) => { 
        if (VaultHelper.getFilenameByTaskId(task.key).length === 0) {
          promisesToCreateNotes.push(this.createTaskNote(settings, normalizedFolderPath, task, TASK_TEMPLATE_MD));
        }
      });

      await Promise.all(promisesToCreateNotes); //Await since KanbamBoard depends on files being created (filenames)

      // Create or replace Kanban board of current sprint
      //this.createKanbanBoard(normalizedFolderPath, tasksInCurrentSprint, currentSprint.name);

    } catch(e) {
      VaultHelper.logError(e);
    }
  }

  private async createTaskNote(settings: any, path: string, task: any, template:string): Promise<TFile> {
    var taskType = task.fields.issuetype.name;
    var filename = VaultHelper.formatTaskFilename(taskType, task.key);
    var filepath = path + `/${filename}.md`;
    var originalLink = `https://${settings.jiraSettings.baseUrl}/browse/${task.key}`;

    return app.vault.create(filepath, template.format(task.fields.summary, taskType.replace(/ /g,''), originalLink));
  }

  /*
  private createKanbanBoard(path: string, tasks: Array<any>, sprintName: string) {
    var filename = `${sprintName}-Board`;
    var filepath = path + `/${filename}.md`;
    var file = app.vault.getAbstractFileByPath(filepath);

    if (file != null) {
      app.vault.delete(file, true);
    }
    
    var tasksInPendingState = this.formatTaskLinks(this.filterTasksInColumn(tasks, COLUMN_PENDING)).join('\n');
    var tasksInProgressState = this.formatTaskLinks(this.filterTasksInColumn(tasks, COLUMN_IN_PROGRESS)).join('\n');
    var tasksInMergeState = this.formatTaskLinks(this.filterTasksInColumn(tasks, COLUMN_IN_MERGE)).join('\n');
    var tasksInVerificationState = this.formatTaskLinks(this.filterTasksInColumn(tasks, COLUMN_IN_VERIFICATION)).join('\n');
    var tasksInClosedState = this.formatTaskLinks(this.filterTasksInColumn(tasks, COLUMN_CLOSED)).join('\n');


    app.vault.create(filepath, BOARD_TEMPLATE_MD.format(tasksInPendingState,tasksInProgressState,tasksInMergeState,tasksInVerificationState,tasksInClosedState))
        .catch(err => console.log(err));
  }

  private filterTasksInColumn(tasks: Array<any>, column: string): Array<any> {
    return tasks.filter(task => task.fields["System.State"] === column);
  }

  private formatTaskLinks(tasks: Array<any>): Array<string> {
    return tasks.map(task => `- [ ] [[${VaultHelper.getFilenameByTaskId(task.id)}]] \n ${task.fields["System.Title"]}`);
  }*/

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
  }
}