import { Notice, TFile } from 'obsidian';
import { Task } from './Task';

export class VaultHelper {

  private static BOARD_TEMPLATE_START: string = "---\n\nkanban-plugin: basic\n\n---\n\n";
  private static BOARD_TEMPLATE_END: string = "\n%% kanban:settings\n\`\`\`\n{\"kanban-plugin\":\"basic\"}\n\`\`\`%%\"";

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
   * Creates all folders for all given paths if they are non-existent
   * @param paths - The list of paths of folders to creates
   * @public
   */
  public static createFoldersFromList(paths: string[]): void {
    paths.forEach(path => this.createFolders(path));
  }

  /**
 * Will return a filehandle if the provided id is in the folder of the provided path
 * @param path - The vault path to search in
 * @param id - The string to search for in the path folder
 * @public
 */
  public static getFileByTaskId(path: string, id: string) : TFile | undefined {
    const files = app.vault.getMarkdownFiles();

    const projectPath = path.slice(0, path.lastIndexOf('/')); // Remove the specific sprint since files can be in old sprints

    for (let i = 0; i < files.length; i++) {

      let filePath = files[i].path
      if (filePath.startsWith(projectPath) && filePath.contains(id)) {
        return files[i];
      }
    }

    return undefined;
  }

  /**
   * Creates all task notes given the provided array of Tasks"
   * @param path - The path to create each task at
   * @param tasks - An array of Tasks
   * @public
   */
  public static createTaskNotes(path: string, tasks: Array<Task>, template: string, notename: string): Promise<TFile>[] {

    let promisesToCreateNotes: Promise<TFile>[] = [];
    tasks.forEach(task => {
      if (this.getFileByTaskId(path, task.id) == undefined) {
        promisesToCreateNotes.push(this.createTaskNote(path, task, template, notename));
      }
    });

    return promisesToCreateNotes;
  }

   /**
   * Builds up a markdown file that represents a Kanban board for the sprint. Utilizes the format for the Kanban plugin"
   * @param path - The path to create each task at
   * @param tasks - An array of Tasks
   * @param columns - An array of column names to match state of the tasks with
   * @param prefix - The prefix to add to the kanban board name
   * @public
   */
  public static createKanbanBoard(path: string, tasks: Array<Task>, columns: Array<string>, prefix: string, teamLeaderMode: boolean): Promise<void> {
    const filename = `${prefix}-Board`;
    const filepath = path + `/${filename}.md`;

    let boardMD = this.BOARD_TEMPLATE_START;

    // Create Kanban board with specified columns matching the state of each task
    columns.forEach((column: string) => {
      boardMD += "## ";
      boardMD += column;
      boardMD += "\n";

      tasks.forEach((task: Task) => {
        if (task.state === column) {
          var file = this.getFileByTaskId(path, task.id);
          if (file != undefined) {

            if (teamLeaderMode) {
              boardMD += `- [ ] [[${file.basename}]] \n ${task.assignedTo} \n ${task.title}\n`
            } else {
              boardMD += `- [ ] [[${file.basename}]] \n ${task.title}\n`
            }

          }
        }
      });

      boardMD += "\n";
    });

    boardMD += this.BOARD_TEMPLATE_END;

    return app.vault.adapter.write(filepath, boardMD);
  }

  private static async createTaskNote(path: string, task: Task, template:string, notename:string): Promise<TFile> {

    let filename = notename
            .replace(/{{TASK_ID}}/g, task.id)
            .replace(/{{TASK_STATE}}/g, task.state)
            .replace(/{{TASK_TYPE}}/g, task.type.replace(/ /g,''))
            .replace(/{{TASK_ASSIGNEDTO}}/g, task.assignedTo);

    const filepath = path + `/${filename}.md`;

    let content = template
            .replace(/{{TASK_ID}}/g, task.id)
            .replace(/{{TASK_TITLE}}/g, task.title)
            .replace(/{{TASK_STATE}}/g, task.state)
            .replace(/{{TASK_TYPE}}/g, task.type.replace(/ /g,''))
            .replace(/{{TASK_ASSIGNEDTO}}/g, task.assignedTo)
            .replace(/{{TASK_LINK}}/g, task.link);

    if (task.desc != null) {
      content = content.replace(/{{TASK_DESCRIPTION}}/g, task.desc);
    } else {
      content = content.replace(/{{TASK_DESCRIPTION}}/g, '');
    }

    return app.vault.create(filepath, content);
  }
}
