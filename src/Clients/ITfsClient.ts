import AgileTaskNotesPlugin,  { AgileTaskNotesPluginSettingTab } from "main";

/**
 * An interface describing a TFS backend implementation
 */
export interface ITfsClient {
  
  /**
   * The title of the client in string format
   */
  clientName: string;

  /**
   * Creates all the user's assigned tasks in the current sprint as markdown notes with the globally defined template
   * Also creates the Kanban board that links to the new files
   * @param settings - The plugin settings
   * @public
   */
  update(settings: any): Promise<void>;

  /**
   * Creates all the required UI elements for this client's settings
   * @param container - The HTML container to build off of
   * @param plugin - The plugin itself
   * @public
   */
  setupSettings(container: HTMLElement, plugin: AgileTaskNotesPlugin, settingsTab: AgileTaskNotesPluginSettingTab): any;
}