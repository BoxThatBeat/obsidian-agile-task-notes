
/**
   * Simple data class that allows for generalization of a task from any TFS
   * Optional fields are only available in Azure for now.
   * @public
   */
export class Task { 
  public id: string;
  public state: string;
  public title: string;
  public type: string;
  public assignedTo: string;
  public link: string;
  public desc: string;
  public criteria?: string;
  public testScenarios?: string;
  public dueDate?: string;
  public tags?: string;

  constructor(id: string, state: string, title: string, type: string, assignedTo: string, link: string, desc: string, criteria?: string, testScenarios?: string, dueDate?: string, tags?: string) {
    this.id = id;
    this.state = state;
    this.title = title;
    this.type = type;    
    this.assignedTo = assignedTo;
    this.link = link;
    this.desc = desc;
    this.criteria = criteria;
    this.testScenarios = testScenarios;
    this.dueDate = dueDate;
    this.tags = tags;
  }
}