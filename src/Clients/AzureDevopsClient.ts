import AgileTaskNotesPlugin, { AgileTaskNotesPluginSettingTab, AgileTaskNotesSettings } from 'main';
import { normalizePath, requestUrl, Setting, TFile, Vault } from 'obsidian';
import { VaultHelper } from 'src/VaultHelper'
import { ITfsClient } from './ITfsClient';
import { Task } from 'src/Task';

export interface AzureDevopsSettings {
  instance: string,
  collection: string,
  project: string,
  team: string,
  username: string,
  accessToken: string,
  columns: string
}

export const AZURE_DEVOPS_DEFAULT_SETTINGS: AzureDevopsSettings = {
	instance: '',
  collection: 'DefaultCollection',
  project: '',
  team: '',
  username: '',
  accessToken: '',
  columns: 'Pending,In Progress,In Merge,In Verification,Closed'
}

const TASKS_QUERY: string = "{\"query\": \"Select [System.Id], [System.Title], [System.State] From WorkItems Where [Assigned to] = \\\"{0}\\\"\"}" // username

export class AzureDevopsClient implements ITfsClient{
  
  clientName: string = 'AzureDevops';

  public async updateCurrentSprint(settings: AgileTaskNotesSettings): Promise<void> {

    const encoded64PAT = Buffer.from(`:${settings.azureDevopsSettings.accessToken}`).toString("base64");

    const headers = {
      "Authorization": `Basic ${encoded64PAT}`,
      "Content-Type": "application/json"
    }

    const BaseURL = `https://${settings.azureDevopsSettings.instance}/${settings.azureDevopsSettings.collection}/${settings.azureDevopsSettings.project}`;

    const username = settings.azureDevopsSettings.username.replace("\'", "\\'");

    try {
      const iterationResponse = await requestUrl({ method: 'GET', headers: headers, url: `${BaseURL}/${settings.azureDevopsSettings.team}/_apis/work/teamsettings/iterations?$timeframe=current&api-version=6.0` });
      const tasksReponse = await requestUrl({method: 'POST', body: TASKS_QUERY.format(username), headers: headers, url: `${BaseURL}/${settings.azureDevopsSettings.team}/_apis/wit/wiql?api-version=6.0` });

      const currentSprint = iterationResponse.json.value[0];
      const userAssignedTaskIds = tasksReponse.json.workItems;
      const normalizedFolderPath =  normalizePath(settings.targetFolder + '/' + currentSprint.path);

      // Ensure folder structure created
      VaultHelper.createFolders(normalizedFolderPath);

      // Get user's assigned tasks in current sprint
      const userAssignedTasks = await Promise.all(userAssignedTaskIds.map((task: any) => requestUrl({ method: 'GET', headers: headers, url: task.url}).then((r) => r.json)));
      const tasksInCurrentSprint = userAssignedTasks.filter(task => task.fields["System.IterationPath"] === currentSprint.path);

      let tasks:Array<Task> = [];
      tasksInCurrentSprint.forEach((task:any) => {
        tasks.push(new Task(task.id, task.fields["System.State"], task.fields["System.Title"], task.fields["System.WorkItemType"], `https://${settings.azureDevopsSettings.instance}/${settings.azureDevopsSettings.collection}/${settings.azureDevopsSettings.project}/_workitems/edit/${task.id}`));
      });

      // Create markdown files based on remote task in current sprint
      await Promise.all(VaultHelper.createTaskNotes(normalizedFolderPath, tasks, settings.noteTemplate))
        .catch(e => VaultHelper.logError(e));
      
      if (settings.createKanban) {
        
        // Create or replace Kanban board of current sprint
        const columnIds = settings.azureDevopsSettings.columns.split(',').map((columnName:string) => columnName.trim());
        await VaultHelper.createKanbanBoard(normalizedFolderPath, tasks, columnIds, currentSprint.name)
          .catch(e => VaultHelper.logError(e));
      }
    
    } catch(e) {
      VaultHelper.logError(e);
    }
  }

  public setupSettings(container: HTMLElement, plugin: AgileTaskNotesPlugin, settingsTab: AgileTaskNotesPluginSettingTab): any {
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

    new Setting(container)
    .setName('Column Names')
    .setDesc('Line-separated list of column key names from your team sprint board to be used in Kanban board')
    .addText(text => text
      .setPlaceholder('Enter comma-seperated list')
      .setValue(plugin.settings.azureDevopsSettings.columns)
      .onChange(async (value) => {
        plugin.settings.azureDevopsSettings.columns = value;
        await plugin.saveSettings();
      }));
  }
}