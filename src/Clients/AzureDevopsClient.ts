import AgileTaskNotesPlugin from 'main';
import { normalizePath, requestUrl, Setting, TFile } from 'obsidian';
import { VaultHelper } from 'src/VaultHelper'
import { ITfsClient } from './ITfsClient';

export interface AzureDevopsSettings {
  instance: string,
  collection: string,
  project: string,
  team: string,
  username: string,
  accessToken: string,
}

export const AZURE_DEVOPS_DEFAULT_SETTINGS: AzureDevopsSettings = {
	instance: '',
  collection: 'DefaultCollection',
  project: '',
  team: '',
  username: '',
  accessToken: ''
}

// TODO: replace with columns pulled from Azure Devops
const COLUMN_PENDING = "Pending";
const COLUMN_IN_PROGRESS = "In Progress";
const COLUMN_IN_MERGE = "In Merge";
const COLUMN_IN_VERIFICATION = "In Verification";
const COLUMN_CLOSED= "Closed";

const TASK_TEMPLATE_MD: string = "# {0}\n{1}\n\nLink: {2}\n\n#todo:\n- [ ] Create todo list\n- [ ] \n## Notes:\n"; // Title, Tags
const BOARD_TEMPLATE_MD: string = "---\n\nkanban-plugin: basic\n\n---\n\n## Pending\n{0}\n## In Progress\n{1}\n## In Merge\n{2}\n## In Verification\n{3}\n## Closed\n**Complete**\n{4}\n%% kanban:settings\n\`\`\`\n{\"kanban-plugin\":\"basic\"}\n\`\`\`%%\"";

const TASKS_QUERY: string = "{\"query\": \"Select [System.Id], [System.Title], [System.State] From WorkItems Where [Assigned to] = \\\"{0}\\\"\"}" // username

export class AzureDevopsClient implements ITfsClient{
  
  clientName: string = 'AzureDevops';

  public async updateCurrentSprint(settings: any): Promise<void> {

    var encoded64PAT = Buffer.from(`:${settings.azureDevopsSettings.accessToken}`).toString("base64");

    const headers = {
      "Authorization": `Basic ${encoded64PAT}`,
      "Content-Type": "application/json"
    }

    const BaseURL = `https://${settings.azureDevopsSettings.instance}/${settings.azureDevopsSettings.collection}/${settings.azureDevopsSettings.project}`;

    var username = settings.azureDevopsSettings.username.replace("\'", "\\'");

    var iterationResponse = await requestUrl({ method: 'GET', headers: headers, url: `${BaseURL}/${settings.azureDevopsSettings.team}/_apis/work/teamsettings/iterations?$timeframe=current&api-version=6.0` });
    var tasksReponse = await requestUrl({method: 'POST', body: TASKS_QUERY.format(username), headers: headers, url: `${BaseURL}/${settings.azureDevopsSettings.team}/_apis/wit/wiql?api-version=6.0` });

    if (iterationResponse.status != 200) {
      VaultHelper.logError(iterationResponse.json);
    }
    if (tasksReponse.status != 200) {
      VaultHelper.logError(iterationResponse.json);
    }

    var currentSprint = iterationResponse.json.value[0];
    var userAssignedTaskIds = tasksReponse.json.workItems;
    var normalizedFolderPath =  normalizePath(settings.targetFolder + '/' + currentSprint.path);

    var userAssignedTasks = await Promise.all(userAssignedTaskIds.map((task: any) => requestUrl({ method: 'GET', headers: headers, url: task.url}).then((r) => r.json)));

    // Ensure folder structure created
    VaultHelper.createFolders(normalizedFolderPath);

    // Get user's assigned tasks in current sprint
    var tasksInCurrentSprint = userAssignedTasks.filter(task => task.fields["System.IterationPath"] === currentSprint.path);

    // Create markdown files based on remote task in current sprint
    var promisesToCreateNotes: Promise<TFile>[] = [];
    tasksInCurrentSprint.forEach(task => { 
      if (VaultHelper.getFilenameByTaskId(task.id).length === 0) {
        promisesToCreateNotes.push(this.createTaskNote(settings, normalizedFolderPath, task, TASK_TEMPLATE_MD));
      }
    });

    await Promise.all(promisesToCreateNotes); //Await since KanbamBoard depends on files being created (filenames)

    // Create or replace Kanban board of current sprint
    this.createKanbanBoard(normalizedFolderPath, tasksInCurrentSprint, currentSprint.name);
  }

  public async createTaskNote(settings: any, path: string, task: any, template:string): Promise<TFile> {
    var filename = VaultHelper.formatTaskFilename(task.fields["System.WorkItemType"], task.id);
    var filepath = path + `/${filename}.md`;
    var originalLink = `https://${settings.azureDevopsSettings.instance}/${settings.azureDevopsSettings.collection}/${settings.azureDevopsSettings.project}/_workitems/edit/${task.id}`;

    return app.vault.create(filepath, template.format(task.fields["System.Title"], `#${task.fields["System.WorkItemType"].replace(/ /g,'')}`, originalLink));
  }

  public createKanbanBoard(path: string, tasks: Array<any>, sprintName: string) {
    var filename = `${sprintName}-Board`;
    var filepath = path + `/${filename}.md`;
    var file = app.vault.getAbstractFileByPath(filepath);

    if (file != null) {
      app.vault.delete(file, true);
    }
    
    var tasksInPendingState = VaultHelper.formatTaskLinks(VaultHelper.filterTasksInColumn(tasks, COLUMN_PENDING)).join('\n');
    var tasksInProgressState = VaultHelper.formatTaskLinks(VaultHelper.filterTasksInColumn(tasks, COLUMN_IN_PROGRESS)).join('\n');
    var tasksInMergeState = VaultHelper.formatTaskLinks(VaultHelper.filterTasksInColumn(tasks, COLUMN_IN_MERGE)).join('\n');
    var tasksInVerificationState = VaultHelper.formatTaskLinks(VaultHelper.filterTasksInColumn(tasks, COLUMN_IN_VERIFICATION)).join('\n');
    var tasksInClosedState = VaultHelper.formatTaskLinks(VaultHelper.filterTasksInColumn(tasks, COLUMN_CLOSED)).join('\n');


    app.vault.create(filepath, BOARD_TEMPLATE_MD.format(tasksInPendingState,tasksInProgressState,tasksInMergeState,tasksInVerificationState,tasksInClosedState))
        .catch(err => console.log(err));
  }

  public setupSettings(container: HTMLElement, plugin: AgileTaskNotesPlugin): any {
    container.createEl('h2', {text: 'AzureDevops Remote Repo Settings'});

		new Setting(container)
			.setName('Instance')
			.setDesc('TFS server name (BaseURL)')
			.addText(text => text
				.setPlaceholder('Enter instance base url')
				.setValue(plugin.settings.azureDevopsSettings.instance)
				.onChange(async (value) => {
					plugin.settings.azureDevopsSettings.instance = value;
					await plugin.saveSettings();
				}));

    new Setting(container)
    .setName('Collection')
    .setDesc('The name of the Azure DevOps collection')
    .addText(text => text
      .setPlaceholder('Enter Collection Name')
      .setValue(plugin.settings.azureDevopsSettings.collection)
      .onChange(async (value) => {
        plugin.settings.azureDevopsSettings.collection = value;
        await plugin.saveSettings();
      }));

    new Setting(container)
    .setName('Project')
    .setDesc('AzureDevops Project ID or project name')
    .addText(text => text
      .setPlaceholder('Enter project name')
      .setValue(plugin.settings.azureDevopsSettings.project)
      .onChange(async (value) => {
        plugin.settings.azureDevopsSettings.project = value;
        await plugin.saveSettings();
      }));

    new Setting(container)
    .setName('Team')
    .setDesc('AzureDevops Team ID or team name')
    .addText(text => text
      .setPlaceholder('Enter team name')
      .setValue(plugin.settings.azureDevopsSettings.team)
      .onChange(async (value) => {
        plugin.settings.azureDevopsSettings.team = value;
        await plugin.saveSettings();
      }));

    new Setting(container)
    .setName('Username')
    .setDesc('Your AzureDevops username (display name)')
    .addText(text => text
      .setPlaceholder('Enter your name')
      .setValue(plugin.settings.azureDevopsSettings.username)
      .onChange(async (value) => {
        plugin.settings.azureDevopsSettings.username = value;
        await plugin.saveSettings();
      }));

    new Setting(container)
    .setName('Personal Access Token')
    .setDesc('Your AzureDevops PAT with full access')
    .addText(text => text
      .setPlaceholder('Enter your PAT')
      .setValue(plugin.settings.azureDevopsSettings.accessToken)
      .onChange(async (value) => {
        plugin.settings.azureDevopsSettings.accessToken = value;
        await plugin.saveSettings();
      }));
  }
}