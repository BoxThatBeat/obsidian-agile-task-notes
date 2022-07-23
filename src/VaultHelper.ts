import { App, Notice, TFile } from 'obsidian';

export class VaultHelper { 

  private app: App;

  public constructor (app:App) {
    app = app;
  }

  public static logError(error: string): void {
    console.log(error);
    new Notice('Error occured, see console logs for details. (ctrl+shift+i) to open');
  }

  public static createFolders(path: string) {
    if (app.vault.getAbstractFileByPath(path) == null) {
      app.vault.createFolder(path)
      .catch(err => console.log(err));
    }
  }

  public static getFilenameByTaskId(id: string) : string {
    const files = app.vault.getMarkdownFiles()

    for (let i = 0; i < files.length; i++) {
      if (files[i].path.contains(id)) {

        var partsOfPath = files[i].path.split("/");
        var filename = partsOfPath[partsOfPath.length - 1];
        
        return filename.substring(0, filename.length-3);; // remove ".md"
      }
    }

    return "";
  }

  public static filterTasksInColumn(tasks: Array<any>, column: string): Array<any> {
    return tasks.filter(task => task.fields["System.State"] === column);
  }

  public static formatTaskLinks(tasks: Array<any>): Array<string> {
    return tasks.map(task => `- [ ] [[${this.getFilenameByTaskId(task.id)}]] \n ${task.fields["System.Title"]}`);
  }

  public static formatTaskFilename(type: string, id: number) {
    return `${type} - ${id}`
  }
}