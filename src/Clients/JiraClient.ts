import AzureDevopsPlugin from 'main';
import { normalizePath, requestUrl, TFile } from 'obsidian';
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

  public setupSettings(container: HTMLElement, plugin: AzureDevopsPlugin): any {
    container.createEl('h2', {text: 'Jira Remote Repo Settings'});

    
  }
}