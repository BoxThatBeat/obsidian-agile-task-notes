import { App, normalizePath, Notice, Plugin, PluginSettingTab, Setting, requestUrl } from 'obsidian';

const TASK_TEMPLATE_MD: string = "# {0}\n{1}\n\nLink: {2}\n\n#todo:\n- [ ] \n\n## Notes:\n"; // Title, Tags
const BOARD_TEMPLATE_MD: string = "---\n\nkanban-plugin: basic\n\n---\n\n## Pending\n{0}\n## In Progress\n{1}\n## In Merge\n{2}\n## In Verification\n{3}\n## Closed\n**Complete**\n{4}\n%% kanban:settings\n\`\`\`\n{\"kanban-plugin\":\"basic\"}\n\`\`\`%%\"";

const TASKS_QUERY: string = "{\"query\": \"Select [System.Id], [System.Title], [System.State] From WorkItems Where [Assigned to] = \'{0}\'\"}" // username

// TODO: replace with columns pulled from Azure Devops
const COLUMN_PENDING = "Pending";
const COLUMN_IN_PROGRESS = "In Progress";
const COLUMN_IN_MERGE = "In Merge";
const COLUMN_IN_VERIFICATION = "In Verification";
const COLUMN_CLOSED= "Closed";

interface AzureDevopsPluginSettings {
	instance: string;
  collection: string;
  project: string;
  team: string,
  username: string,
  accessToken: string,
  targetFolder: string
}

const DEFAULT_SETTINGS: AzureDevopsPluginSettings = {
	instance: '',
  collection: 'DefaultCollection',
  project: '',
  team: '',
  username: '',
  accessToken: '',
  targetFolder: 'Work/AgileSprints'
}

export default class AzureDevopsPlugin extends Plugin {
	settings: AzureDevopsPluginSettings;

	async onload() {
		await this.loadSettings();

		// This creates an icon in the left ribbon.
		this.addRibbonIcon('dice', 'Update Boards', (evt: MouseEvent) => {
			this.updateCurrentSprintBoard();
		});

		// This adds a command that can be triggered anywhere
		this.addCommand({
			id: 'update-all-boards',
			name: 'Update all Kanban boards',
			callback: () => {
				this.updateCurrentSprintBoard();
			}
		});

		this.addSettingTab(new AzureDevopsPluginSettingTab(this.app, this));
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

  private async updateCurrentSprintBoard() {

    var encoded64PAT = Buffer.from(`:${this.settings.accessToken}`, 'base64');

    const headers = {
      "Authorization": `Basic ${encoded64PAT}`,
      "Content-Type": "application/json"
    }

    const BaseURL = `https://${this.settings.instance}/${this.settings.collection}/${this.settings.project}`;

    Promise.all([
      requestUrl({ method: 'GET', headers: headers, url: `${BaseURL}/${this.settings.team}/_apis/work/teamsettings/iterations?$timeframe=current&api-version=6.0` }),
      requestUrl({method: 'POST', body: TASKS_QUERY.format(this.settings.username), headers: headers, url: `${BaseURL}/${this.settings.team}/_apis/wit/wiql?api-version=6.0` })
    ])
      .then((responses) => {

        if (responses[0].status != 200 || responses[1].status != 200) {
          console.log("Azure Devops API Error.", responses);
          new Notice('Error occured, see console logs for details.');
          return;
        }

        var currentSprint = responses[0].json.value[0];
        var userAssignedTaskIds = responses[1].json.workItems;
        var normalizedFolderPath =  normalizePath(this.settings.targetFolder + '/' + currentSprint.path);

        Promise.all(userAssignedTaskIds.map((task: any) => requestUrl({ method: 'GET', headers: headers, url: task.url}).then((r) => r.json)))
          .then((userAssignedTasks) => {

            // Ensure folder structure created
            this.createFolders(normalizedFolderPath);

            // Create markdown files based on remote task in current sprint
            var tasksInCurrentSprint = userAssignedTasks.filter(task => task.fields["System.IterationPath"] === currentSprint.path);
            tasksInCurrentSprint.forEach(task => this.createTaskNote(normalizedFolderPath, task));

            // Create or replace Kanban board of current sprint
            this.createKanbanBoard(normalizedFolderPath, tasksInCurrentSprint, currentSprint.name);

            new Notice('Updated all Kanban boards successfully!');
          });
      });
  }

  private createFolders(path: string) {
    if (this.app.vault.getAbstractFileByPath(path) == null) {
      this.app.vault.createFolder(path)
      .catch(err => console.log(err));
    }
  }

  private createTaskNote(path: string, task: any) {
    var filename = this.formatTaskFilename(task.fields["System.WorkItemType"], task.id);
    var filepath = path + `/${filename}.md`;
    var originalLink = `https://${this.settings.instance}/${this.settings.collection}/${this.settings.project}/_workitems/edit/${task.id}`;

    if (this.app.vault.getAbstractFileByPath(filepath) == null) { //TODO: instead check  if the task number is contained in any file name in the system (so that users can change their task titles)
      this.app.vault.create(filepath, TASK_TEMPLATE_MD.format(task.fields["System.Title"], `#${task.fields["System.WorkItemType"].replace(/ /g,'')}`, originalLink))
        .catch(err => console.log(err));
    }
  }

  private createKanbanBoard(path: string, tasks: Array<any>, sprintName: string) {
    var filename = `${sprintName}-Board`;
    var filepath = path + `/${filename}.md`;
    var file = this.app.vault.getAbstractFileByPath(filepath);

    if (file != null) {
      this.app.vault.delete(file, true);
    }
    
    var tasksInPendingState = this.formatTaskLinks(this.filterTasksInColumn(tasks, COLUMN_PENDING)).join('\n');
    var tasksInProgressState = this.formatTaskLinks(this.filterTasksInColumn(tasks, COLUMN_IN_PROGRESS)).join('\n');
    var tasksInMergeState = this.formatTaskLinks(this.filterTasksInColumn(tasks, COLUMN_IN_MERGE)).join('\n');
    var tasksInVerificationState = this.formatTaskLinks(this.filterTasksInColumn(tasks, COLUMN_IN_VERIFICATION)).join('\n');
    var tasksInClosedState = this.formatTaskLinks(this.filterTasksInColumn(tasks, COLUMN_CLOSED)).join('\n');


    this.app.vault.create(filepath, BOARD_TEMPLATE_MD.format(tasksInPendingState,tasksInProgressState,tasksInMergeState,tasksInVerificationState,tasksInClosedState))
        .catch(err => console.log(err));
  }

  private filterTasksInColumn(tasks: Array<any>, column: string): Array<any> {
    return tasks.filter(task => task.fields["System.State"] === column);
  }

  private formatTaskLinks(tasks: Array<any>): Array<string> {
    return tasks.map(task => `- [ ] [[${this.formatTaskFilename(task.fields["System.WorkItemType"], task.id)}]] \n ${task.fields["System.Title"]}`);
  }

  private formatTaskFilename(type: string, id: number) {
    return `${type} - ${id}`
  }
}

class AzureDevopsPluginSettingTab extends PluginSettingTab {
	plugin: AzureDevopsPlugin;

	constructor(app: App, plugin: AzureDevopsPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: 'AzureDevops Remote Repo Settings'});

		new Setting(containerEl)
			.setName('Instance')
			.setDesc('TFS server name (BaseURL)')
			.addText(text => text
				.setPlaceholder('Enter instance base url')
				.setValue(this.plugin.settings.instance)
				.onChange(async (value) => {
					this.plugin.settings.instance = value;
					await this.plugin.saveSettings();
				}));

    new Setting(containerEl)
    .setName('Collection')
    .setDesc('The name of the Azure DevOps collection')
    .addText(text => text
      .setPlaceholder('Enter Collection Name')
      .setValue(this.plugin.settings.collection)
      .onChange(async (value) => {
        this.plugin.settings.collection = value;
        await this.plugin.saveSettings();
      }));

    new Setting(containerEl)
    .setName('Project')
    .setDesc('AzureDevops Project ID or project name')
    .addText(text => text
      .setPlaceholder('Enter project name')
      .setValue(this.plugin.settings.project)
      .onChange(async (value) => {
        this.plugin.settings.project = value;
        await this.plugin.saveSettings();
      }));

    new Setting(containerEl)
    .setName('Team')
    .setDesc('AzureDevops Team ID or team name')
    .addText(text => text
      .setPlaceholder('Enter team name')
      .setValue(this.plugin.settings.team)
      .onChange(async (value) => {
        this.plugin.settings.team = value;
        await this.plugin.saveSettings();
      }));

    new Setting(containerEl)
    .setName('Username')
    .setDesc('Your AzureDevops username (display name)')
    .addText(text => text
      .setPlaceholder('Enter your name')
      .setValue(this.plugin.settings.username)
      .onChange(async (value) => {
        this.plugin.settings.username = value;
        await this.plugin.saveSettings();
      }));

    new Setting(containerEl)
    .setName('Personal Access Token')
    .setDesc('Your AzureDevops PAT with full access')
    .addText(text => text
      .setPlaceholder('Enter your PAT')
      .setValue(this.plugin.settings.accessToken)
      .onChange(async (value) => {
        this.plugin.settings.accessToken = value;
        await this.plugin.saveSettings();
      }));

    containerEl.createEl('h2', {text: 'Plugin Settings'});

    new Setting(containerEl)
    .setName('Target Folder (Optional)')
    .setDesc('The relative path to the parent folder in which to create/update Kanban boards')
    .addText(text => text
      .setPlaceholder('Enter target folder')
      .setValue(this.plugin.settings.targetFolder)
      .onChange(async (value) => {
        this.plugin.settings.targetFolder = value;
        await this.plugin.saveSettings();
      }));

	}
}
