import AgileTaskNotesPlugin from "main";

export interface ITfsClient {
  
  clientName: string;

  updateCurrentSprint(settings: any): Promise<void>;
  setupSettings(container: HTMLElement, plugin: AgileTaskNotesPlugin): any;
}