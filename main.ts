import { App, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { AzureDevopsClient, AzureDevopsSettings, AZURE_DEVOPS_DEFAULT_SETTINGS } from 'src/Clients/AzureDevopsClient'
import { ITfsClient } from './src/Clients/ITfsClient';
import { JiraClient, JiraSettings, JIRA_DEFAULT_SETTINGS } from './src/Clients/JiraClient';

export interface AgileTaskNotesSettings {
  selectedTfsClient: string,
  targetFolder: string,
  noteTemplate: string,
  noteName: string,
  intervalMinutes: number,
  createKanban: boolean,
  teamLeaderMode: boolean,
	azureDevopsSettings: AzureDevopsSettings,
  jiraSettings: JiraSettings
}

const DEFAULT_SETTINGS: AgileTaskNotesSettings = {
  selectedTfsClient: 'AzureDevops',
  targetFolder: '',
  noteTemplate: '# {{TASK_TITLE}}\n#{{TASK_TYPE}}\n\nid: {{TASK_ID}}\nstate: {{TASK_STATE}}\nAssignedTo: {{TASK_ASSIGNEDTO}}\n\nLink: {{TASK_LINK}}\n\n{{TASK_DESCRIPTION}}\n\n#todo:\n- [ ] Create todo list\n- [ ] \n\n## Notes:\n',
  noteName: '{{TASK_TYPE}} - {{TASK_ID}}',
  intervalMinutes: 0,
  createKanban: true,
  teamLeaderMode: false,
  azureDevopsSettings: AZURE_DEVOPS_DEFAULT_SETTINGS,
  jiraSettings: JIRA_DEFAULT_SETTINGS
}

export default class AgileTaskNotesPlugin extends Plugin {
	settings: AgileTaskNotesSettings;

  tfsClientImplementations: { [key: string]: ITfsClient } = {};

	async onload() {

    // Add TFS backend implmentations
    const azureDevopsClient:ITfsClient = new AzureDevopsClient();
    const jiraClient: ITfsClient = new JiraClient();
    
    this.tfsClientImplementations[azureDevopsClient.clientName] = azureDevopsClient;
    this.tfsClientImplementations[jiraClient.clientName] = jiraClient;

    await this.loadSettings();

		// This creates an icon in the left ribbon for updating boards.
		this.addRibbonIcon('dice', 'Update TFS Tasks', () => {
			this.tfsClientImplementations[this.settings.selectedTfsClient].update(this.settings);
      new Notice('Updated current tasks successfully!');
		});

		this.addCommand({
			id: 'update-tfs-tasks',
			name: 'Update TFS Tasks',
			callback: () => {
				this.tfsClientImplementations[this.settings.selectedTfsClient].update(this.settings);
        new Notice('Updated current tasks successfully!');
			}
		});

		this.addSettingTab(new AgileTaskNotesPluginSettingTab(this.app, this));

    if (this.settings.intervalMinutes > 0) {
      this.registerInterval(window.setInterval(() => this.tfsClientImplementations[this.settings.selectedTfsClient].update(this.settings), this.settings.intervalMinutes * 60000));
    }
  }

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

export class AgileTaskNotesPluginSettingTab extends PluginSettingTab {
	plugin: AgileTaskNotesPlugin;

	constructor(app: App, plugin: AgileTaskNotesPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl, plugin} = this;

		containerEl.empty();

    new Setting(containerEl)
      .setName('Backend TFS')
      .setDesc('The type of TFS you use.')
      .addDropdown((dropdown) => {
        for (const client in plugin.tfsClientImplementations) {
          dropdown.addOption(client, client);
        }
        dropdown.setValue(plugin.settings.selectedTfsClient)
          .onChange(async (value) => {
            plugin.settings.selectedTfsClient = value;
            await plugin.saveSettings();
            this.display();
          });
      });

    new Setting(containerEl)
    .setName('Team Leader Mode')
    .setDesc('Pulls tasks of entire team and shows usernames in generated Kanban board. (ignores username list)')
    .addToggle(toggle => toggle
      .setValue(plugin.settings.teamLeaderMode)
      .onChange(async (value) => {
        plugin.settings.teamLeaderMode = value
        await plugin.saveSettings();
      }));

    plugin.tfsClientImplementations[plugin.settings.selectedTfsClient].setupSettings(containerEl, plugin, this);

    containerEl.createEl('h2', {text: 'Vault Settings'});

    new Setting(containerEl)
    .setName('Target Folder (Optional)')
    .setDesc('The relative path to the parent folder in which to create/update Kanban boards')
    .addText(text => text
      .setPlaceholder('Enter target folder')
      .setValue(plugin.settings.targetFolder)
      .onChange(async (value) => {
        plugin.settings.targetFolder = value;
        await plugin.saveSettings();
      }));

    new Setting(containerEl)
    .setName('Inital Task Content')
    .setDesc('Set the inital content for each new task note. Available variables: {{TASK_ID}}, {{TASK_TITLE}}, {{TASK_TYPE}}, {{TASK_STATE}}, {{TASK_ASSIGNEDTO}}, {{TASK_LINK}}, {{TASK_DESCRIPTION}}')
    .addTextArea(text => {
        text
            .setPlaceholder('Initial content in raw markdown format')
            .setValue(this.plugin.settings.noteTemplate)
            .onChange(async (value) => {
                try {
                    this.plugin.settings.noteTemplate = value;
                    await this.plugin.saveSettings();
                } catch (e) {
                    return false;
                }
            })
        text.inputEl.rows = 8;
        text.inputEl.cols = 50;
    });
    new Setting(containerEl)
    .setName('Note Name')
    .setDesc('Set the format of the file name for each task note. Available variables: {{TASK_ID}}, {{TASK_TYPE}}, {{TASK_STATE}}, {{TASK_ASSIGNEDTO}}')
    .addText(text => text
      .setPlaceholder('{{TASK_TYPE}} - {{TASK_ID}}')
      .setValue(plugin.settings.noteName)
      .onChange(async (value) => {
        plugin.settings.noteName = value;
        await plugin.saveSettings();
      }));

    new Setting(containerEl)
    .setName('Update interval')
    .setDesc('Interval (in minutes) to periodically update the kanban board and notes. Set to 0 for only manual updating. You\'ll need to restart Obsidian for this to take effect. Note: when an update occurs it will close the kanban board if it is open thus a number over 10 mins is recommended.')
    .addText(text => text
      .setPlaceholder('Enter number in minutes')
      .setValue(plugin.settings.intervalMinutes.toString())
      .onChange(async (value) => {
        plugin.settings.intervalMinutes = parseInt(value);
        await plugin.saveSettings();
      }));

    new Setting(containerEl)
    .setName('Create Kanban board?')
    .setDesc('Should a Kanban board be generated for the current sprint (requires the Kanban board plugin in addition to this one)')
    .addToggle(toggle => toggle
      .setValue(plugin.settings.createKanban)
      .onChange(async (value) => {
        plugin.settings.createKanban = value
        await plugin.saveSettings();
      }));
	}
}
