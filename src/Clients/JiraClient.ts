import AgileTaskNotesPlugin from 'main';
import { normalizePath, requestUrl, Setting, TFile } from 'obsidian';
import { VaultHelper } from 'src/VaultHelper'
import { ITfsClient } from './ITfsClient';

export interface JiraSettings {
  email: string,
  apiToken: string
}

export const JIRA_DEFAULT_SETTINGS: JiraSettings = {
	email: '',
  apiToken: ''
}

export class JiraClient implements ITfsClient{
  
  clientName: string = 'Jira';

  public async updateCurrentSprint(settings: any): Promise<void> {

  }

  public setupSettings(container: HTMLElement, plugin: AgileTaskNotesPlugin): any {
    container.createEl('h2', {text: 'Jira Remote Repo Settings'});

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
  }
}