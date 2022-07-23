import AzureDevopsPlugin from 'main';
import { normalizePath, requestUrl, TFile } from 'obsidian';
import { VaultHelper } from 'src/VaultHelper'
import { ITfsClient } from './ITfsClient';

export class JiraClient implements ITfsClient{
  
  clientName: string = 'Jira';

  public async updateCurrentSprint(settings: any): Promise<void> {

  }

  public setupSettings(container: HTMLElement, plugin: AzureDevopsPlugin): any {
    container.createEl('h2', {text: 'Jira Remote Repo Settings'});


  }
}