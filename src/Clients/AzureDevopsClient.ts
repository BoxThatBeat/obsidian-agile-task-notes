import AgileTaskNotesPlugin, { AgileTaskNotesPluginSettingTab, AgileTaskNotesSettings } from 'main';
import { normalizePath, requestUrl, Setting } from 'obsidian';
import { VaultHelper } from 'src/VaultHelper'
import { ITfsClient } from './ITfsClient';
import { Task } from 'src/Task';

export interface AzureDevopsSettings {
  instance: string,
  collection: string,
  project: string,
  team: string,
  usernames: string,
  accessToken: string,
  columns: string
}

export const AZURE_DEVOPS_DEFAULT_SETTINGS: AzureDevopsSettings = {
    instance: '',
  collection: '',
  project: '',
  team: '',
  usernames: '',
  accessToken: '',
  columns: 'Pending,In Progress,In Merge,In Verification,Closed'
}

const TASKS_QUERY: string = '{"query": "Select [System.Id], [System.Title], [System.State] From WorkItems Where [System.IterationPath] UNDER \\"{0}\\"{1}"}' // iteration path, other(usernames)
const USER_OPERAND: string = '[Assigned to] = \\"{0}\\"'

export class AzureDevopsClient implements ITfsClient{
  
  clientName: string = 'AzureDevops';

  public async update(settings: AgileTaskNotesSettings): Promise<void> {

    const encoded64PAT = Buffer.from(`:${settings.azureDevopsSettings.accessToken}`).toString("base64");

    const headers = {
      "Authorization": `Basic ${encoded64PAT}`,
      "Content-Type": "application/json"
    }

    const BaseURL = `https://${settings.azureDevopsSettings.instance}/${settings.azureDevopsSettings.collection}/${settings.azureDevopsSettings.project}`;

    try {
      const iterationResponse = await requestUrl(
        { 
          method: 'GET', 
          headers: headers, 
          url: `${BaseURL}/${settings.azureDevopsSettings.team}/_apis/work/teamsettings/iterations?$timeframe=current&api-version=6.0` 
        }
      );
      const currentSprint = iterationResponse.json.value[0];
      const normalizeIterationPath = currentSprint.path.normalize().replace(/\\/g, '\\\\');
      
      var taskIds:any;

      if (settings.teamLeaderMode) {

        console.log(TASKS_QUERY.format(normalizeIterationPath, ''));
        const tasksReponse = await requestUrl(
          {
            method: 'POST', 
            body: TASKS_QUERY.format(normalizeIterationPath, ''), 
            headers: headers, 
            url: `${BaseURL}/${settings.azureDevopsSettings.team}/_apis/wit/wiql?api-version=6.0` 
          }
        );
        
        taskIds = tasksReponse.json.workItems;

      } else { 
        const usernames = settings.azureDevopsSettings.usernames.split(',').map((username:string) => username.trim().replace("\'", "\\'"));

        // Put query together dynamically based on number of usernames requested
        let multiUserOperands = ' AND ';
        for (let i = 0; i < usernames.length; i++) {
          multiUserOperands += USER_OPERAND.format(usernames[i]);

          if (i < usernames.length - 1) {
            multiUserOperands += ' OR ';
          }
        }

        console.log(TASKS_QUERY.format(normalizeIterationPath, multiUserOperands));

        const tasksReponse = await requestUrl(
          {
            method: 'POST', 
            body: TASKS_QUERY.format(normalizeIterationPath, multiUserOperands), 
            headers: headers, 
            url: `${BaseURL}/${settings.azureDevopsSettings.team}/_apis/wit/wiql?api-version=6.0` 
          }
        );
        
        taskIds = tasksReponse.json.workItems;
      }

      const normalizedFolderPath =  normalizePath(settings.targetFolder + '/' + currentSprint.path);

      // Ensure folder structure created
      VaultHelper.createFolders(normalizedFolderPath);

      // Get assigned tasks
      const assignedTasks = await Promise.all(taskIds.map((task: any) => requestUrl(
        { 
          method: 'GET', 
          headers: headers, 
          url: task.url
        }).then((r) => r.json)));
      
      let tasks:Array<Task> = [];
      assignedTasks.forEach((task:any) => {

        let assigneeName = 'Unassigned'
		const assignee = task.fields["System.AssignedTo"] ?? null ;
		if (assignee !== null) {
			assigneeName = assignee["displayName"];
		}

        tasks.push(new Task(
          task.id, 
          task.fields["System.State"], 
          task.fields["System.Title"], 
          task.fields["System.WorkItemType"], 
          assigneeName, 
          `https://${settings.azureDevopsSettings.instance}/${settings.azureDevopsSettings.collection}/${settings.azureDevopsSettings.project}/_workitems/edit/${task.id}`, 
          task.fields["System.Description"]));
      });

      // Create markdown files based on remote task in current sprint
      await Promise.all(VaultHelper.createTaskNotes(normalizedFolderPath, tasks, settings.noteTemplate, settings.noteName))
        .catch(e => VaultHelper.logError(e));
      
      if (settings.createKanban) {
        
        // Create or replace Kanban board of current sprint
        const columnIds = settings.azureDevopsSettings.columns.split(',').map((columnName:string) => columnName.trim());
        await VaultHelper.createKanbanBoard(normalizedFolderPath, tasks, columnIds, currentSprint.name, settings.teamLeaderMode)
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
            .setDesc('TFS server name (ex: dev.azure.com/OrgName)')
            .addText(text => text
                .setPlaceholder('Enter instance base url')
                .setValue(plugin.settings.azureDevopsSettings.instance)
                .onChange(async (value) => {
                    plugin.settings.azureDevopsSettings.instance = value;
                    await plugin.saveSettings();
                }));

    new Setting(container)
    .setName('Collection')
    .setDesc('The name of the Azure DevOps collection (leave empty if it does not apply)')
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
    .setName('Usernames')
    .setDesc('A comma-separated list of usernames you want the tasks of. Simply put your username if you only need your own.')
    .addText(text => text
      .setPlaceholder('Enter usernames')
      .setValue(plugin.settings.azureDevopsSettings.usernames)
      .onChange(async (value) => {
        plugin.settings.azureDevopsSettings.usernames = value;
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
      .setPlaceholder('Enter comma-separated list')
      .setValue(plugin.settings.azureDevopsSettings.columns)
      .onChange(async (value) => {
        plugin.settings.azureDevopsSettings.columns = value;
        await plugin.saveSettings();
      }));
  }
}
