import { Notice } from 'obsidian';

export class VaultHelper { 

  /**
   * Logs an error and notifies user that an error occured
   * @param error - The error message to log
   * @public
   */
  public static logError(error: string): void {
    console.log(error);
    new Notice('Error occured, see console logs for details. (ctrl+shift+i) to open');
  }

  /**
   * Creates all folders in a given path if they are non-existant
   * @param path - The path of folders to creates
   * @public
   */
  public static createFolders(path: string) {
    if (app.vault.getAbstractFileByPath(path) == null) {
      app.vault.createFolder(path)
      .catch(err => console.log(err));
    }
  }

  /**
   * Will return a filename if the provided id is in the title of a markdown file in the vault
   * @param id - The string to search for in all filenames in the vault
   * @public
   */
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

  /**
   * Formats a task filename in this format: "{type} - {id}"
   * @param type - The type of task
   * @param id - The ID of the task
   * @public
   */
  public static formatTaskFilename(type: string, id: number) {
    return `${type} - ${id}`
  }
}