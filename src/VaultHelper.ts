import { Notice, TFile } from 'obsidian';
import { Task } from './Task';

export class VaultHelper { 

  public static BOARD_TEMPLATE_START: string = "---\n\nkanban-plugin: basic\n\n---\n\n";
  public static BOARD_TEMPLATE_END: string = "\n%% kanban:settings\n\`\`\`\n{\"kanban-plugin\":\"basic\"}\n\`\`\`%%\"";

  public static TASK_TEMPLATE_MD: string = "# {0}\n#{1}\n\nLink: {2}\n\n#todo:\n- [ ] Create todo list\n- [ ] \n\n## Notes:\n"; // Title, Tags

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
  public static createFolders(path: string): void {
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
  public static formatTaskFilename(type: string, id: string): string {
    return `${type} - ${id}`
  }

  /**
   * Creates all task notes given the provided array of Tasks"
   * @param path - The path to create each task at
   * @param tasks - An array of Tasks
   * @public
   */
  public static createTaskNotes(path: string, tasks: Array<Task>): Promise<TFile>[] {

    var promisesToCreateNotes: Promise<TFile>[] = [];
    tasks.forEach(task => { 
      if (this.getFilenameByTaskId(task.id).length === 0) {
        promisesToCreateNotes.push(this.createTaskNote(path, task, this.TASK_TEMPLATE_MD));
      }
    });

      return promisesToCreateNotes;
  }

   /**
   * Builds up a markdown file that represents a Kanban board for the sprint. Utilizes the format for the Kanban plugin"
   * @param path - The path to create each task at
   * @param tasks - An array of Tasks
   * @param columns - An array of column names to match state of the tasks with
   * @param sprintName - The name of the current sprint
   * @public
   */
  public static createKanbanBoard(path: string, tasks: Array<Task>, columns: Array<string>, sprintName: string): Promise<TFile> {
    var filename = `${sprintName}-Board`;
    var filepath = path + `/${filename}.md`;
    var existantBoard = app.vault.getAbstractFileByPath(filepath);

    if (existantBoard != null) {
      app.vault.delete(existantBoard, true);
    }

    var boardMD = this.BOARD_TEMPLATE_START;
    
    // Create Kanban board with specified columns matching the state of each task
    columns.forEach((column: string) => {
      boardMD += "## ";
      boardMD += column;
      boardMD += "\n";

      tasks.forEach((task: Task) => {
        if (task.state === column) {
          var taskFilename = this.getFilenameByTaskId(task.id);
          boardMD += `- [ ] [[${taskFilename}]] \n ${task.title}\n`
        }
      });

      boardMD += "\n";
    });

    boardMD += this.BOARD_TEMPLATE_END;

    return app.vault.create(filepath, boardMD);
  }

  private static async createTaskNote(path: string, task: Task, template:string): Promise<TFile> {
    var filename = VaultHelper.formatTaskFilename(task.type, task.id);
    var filepath = path + `/${filename}.md`;

    return app.vault.create(filepath, template.format(task.title, task.type.replace(/ /g,''), task.link));
  }
}