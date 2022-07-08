import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';

// Remember to rename these classes and interfaces!

interface AzureDevopsPluginSettings {
	instance: string;
  collection: string;
  project: string;
  team: string
}

const DEFAULT_SETTINGS: AzureDevopsPluginSettings = {
	instance: '',
  collection: 'DefaultCollection',
  project: '',
  team: ''
}

export default class AzureDevopsPlugin extends Plugin {
	settings: AzureDevopsPluginSettings;

	async onload() {
		await this.loadSettings();

		// This creates an icon in the left ribbon.
		this.addRibbonIcon('dice', 'UpdateBoards', (evt: MouseEvent) => {
			this.updateAllBoards();
		});

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		//const statusBarItemEl = this.addStatusBarItem();
		//statusBarItemEl.setText('Status Bar Text');

		// This adds a command that can be triggered anywhere
		this.addCommand({
			id: 'update-all-boards',
			name: 'Update all Kanban boards',
			callback: () => {
				this.updateAllBoards();
			}
		});

		this.addSettingTab(new AzureDevopsPluginSettingTab(this.app, this));

		// If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// Using this function will automatically remove the event listener when this plugin is disabled.
		/*this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
			console.log('click', evt);
		});

		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));*/
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

  private async updateAllBoards() {

    new Notice('Updated all Kanban boards successfully!');
  }
}

class SampleModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.setText('Woah!');
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
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
	}
}
