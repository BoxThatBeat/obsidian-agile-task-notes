import { App, normalizePath, Notice, Plugin, PluginSettingTab, Setting, requestUrl } from 'obsidian';

const TASK_TEMPLATE_MD: string = "# {0}\n{1}\n\n## Todo:\n- [ ] \n\n## Notes:\n"; // Title, Tags
const BOARD_TEMPLATE_MD: string = "---\n\nkanban-plugin: basic\n\n---\n\n## Todo\n\n## In Progress\n\n## In Merge\n\n## In Verification\n\n## Complete\n**Complete**\n\n%% kanban:settings\n\`\`\`\n{\"kanban-plugin\":\"basic\"}\n\`\`\`%%\"";

const TASKS_QUERY: string = "{\"query\": \"Select [System.Id], [System.Title], [System.State] From WorkItems Where [Assigned to] = \'{0}\'\"}" // username

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
      this.ensureFolderSetup();
			this.updateCurrentSprintBoard();
		});

		// This adds a command that can be triggered anywhere
		this.addCommand({
			id: 'update-all-boards',
			name: 'Update all Kanban boards',
			callback: () => {
        this.ensureFolderSetup();
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

  private async ensureFolderSetup() {
    this.createFolders(this.settings.targetFolder)
    
  }

  private async updateCurrentSprintBoard() {

    const headers = {
      "Authorization": `Basic ${this.settings.accessToken}`,
      "Content-Type": "application/json"
    }

    const baseURL = `https://${this.settings.instance}/${this.settings.collection}/${this.settings.project}`;

    Promise.all([
      requestUrl({ method: 'GET', headers: headers, url: `${baseURL}/${this.settings.team}/_apis/work/teamsettings/iterations?$timeframe=current&api-version=6.0` }),
      requestUrl({method: 'POST', body: TASKS_QUERY.format(this.settings.username), headers: headers, url: `${baseURL}/${this.settings.team}/_apis/wit/wiql?api-version=6.0` })
    ])
      .then((responses) => {

        if (responses[0].status != 200 || responses[1].status != 200) {
          console.log("Azure Devops API Error.", responses);
          return;
        }

        var currentIteration = responses[0].json.value[0];
        var userAssignedTasks = responses[1].json.workItems;

        // Ensure folder structure created
        this.createFolders(currentIteration.path);

        userAssignedTasks.forEach((workItem: any) => {
          requestUrl({ method: 'GET', headers: headers, url: workItem.url })
            .then((response) => {
              if (response.status != 200) {
                console.log("Azure Devops API Error.", response);
                return;
              }

              // Create notes file based on work item
              console.log(response.json.id);

              /*if (this.app.vault.getAbstractFileByPath(normalizePath(this.settings.targetFolder) + "/testfile.md") == null) {
                this.app.vault.create(normalizePath(this.settings.targetFolder) + "/testfile.md", TASK_TEMPLATE_MD.format('Test', '#bug'))
                .catch(err => console.log(err));*/

            });
        });

        // Delete current board files

        // Create new and updated boards
      });

    new Notice('Updated all Kanban boards successfully!');
  }

  private createFolders(path: string) {
    var normalizedFolderPath = normalizePath(path);
    if (this.app.vault.getAbstractFileByPath(normalizedFolderPath) == null) {
      this.app.vault.createFolder(normalizedFolderPath)
      .catch(err => console.log(err));
    }
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

    containerEl.createEl('h2', {text: 'Local Folder Settings'});

    new Setting(containerEl)
    .setName('Target Boards Folder')
    .setDesc('The relative path to the folder in which to create/update Kanban boards')
    .addText(text => text
      .setPlaceholder('Enter target folder')
      .setValue(this.plugin.settings.targetFolder)
      .onChange(async (value) => {
        this.plugin.settings.targetFolder = value;
        await this.plugin.saveSettings();
      }));

	}
}
