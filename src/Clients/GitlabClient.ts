import AgileTaskNotesPlugin, { AgileTaskNotesPluginSettingTab, AgileTaskNotesSettings } from 'main';
import { App, normalizePath, requestUrl, RequestUrlResponse, Setting, TFile } from 'obsidian';
import { Task } from 'src/Task';
import { VaultHelper } from 'src/VaultHelper';
import { ITfsClient } from './ITfsClient';

export interface GitlabSettings {
  baseUrl: string;
  projectId: string;
  accessToken: string;
  usernames: string;
  boardId: string;
  mode: string;
  useMilestoneName: boolean;
  columns: string;
  excludeClosed: boolean;
}

export const GITLAB_DEFAULT_SETTINGS: GitlabSettings = {
  baseUrl: 'gitlab.com',
  projectId: '',
  accessToken: '',
  usernames: '',
  boardId: '',
  mode: 'milestones',
  useMilestoneName: true,
  columns: 'Open,Closed',
  excludeClosed: false,
};

export class GitlabClient implements ITfsClient {
  clientName: string = 'Gitlab';

  constructor(private app: App) {}

  public async update(settings: AgileTaskNotesSettings): Promise<void> {
    const headers = {
      'PRIVATE-TOKEN': settings.gitlabSettings.accessToken,
      'Content-Type': 'application/json',
    };

    const projectId = encodeURIComponent(settings.gitlabSettings.projectId);
    const BaseURL = `https://${settings.gitlabSettings.baseUrl}/api/v4`;

    try {
      if (settings.gitlabSettings.mode === 'milestones') {
        await this.updateMilestonesMode(settings, headers, BaseURL, projectId);
      } else if (settings.gitlabSettings.mode === 'board') {
        await this.updateBoardMode(settings, headers, BaseURL, projectId);
      } else if (settings.gitlabSettings.mode === 'user') {
        await this.updateUserMode(settings, headers, BaseURL, projectId);
      }
    } catch (e) {
      VaultHelper.logError(e);
    }
  }

  private async updateMilestonesMode(
    settings: AgileTaskNotesSettings,
    headers: any,
    BaseURL: string,
    projectId: string
  ): Promise<void> {
    // Get active milestones (used as sprints)
    const milestonesResponse = await requestUrl({
      method: 'GET',
      headers: headers,
      url: `${BaseURL}/projects/${projectId}/milestones?state=active`,
    });

    if (!milestonesResponse.json.length) {
      VaultHelper.logError('No active milestones found in GitLab project');
      return;
    }

    const currentMilestone = milestonesResponse.json[0];
    const milestoneIdentifier = settings.gitlabSettings.useMilestoneName
      ? currentMilestone.title
          .replace(/[^a-zA-Z0-9 -]/g, '')
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-')
      : currentMilestone.id;

    const normalizedFolderPath = normalizePath(settings.targetFolder + '/milestone-' + milestoneIdentifier);

    VaultHelper.createFolders(normalizedFolderPath, this.app);

    // Fetch issues for the active milestone
    let issues: any[] = [];

    if (settings.teamLeaderMode) {
      issues = await this.fetchAllIssues(
        `${BaseURL}/projects/${projectId}/issues?milestone=${encodeURIComponent(currentMilestone.title)}&per_page=100`,
        headers
      );
    } else {
      const usernames = settings.gitlabSettings.usernames.split(',').map((u: string) => u.trim());

      const issueArrays = await Promise.all(
        usernames.map((username: string) =>
          this.fetchAllIssues(
            `${BaseURL}/projects/${projectId}/issues?milestone=${encodeURIComponent(currentMilestone.title)}&assignee_username=${encodeURIComponent(username)}&per_page=100`,
            headers
          )
        )
      );
      issues = issueArrays.flat();
    }

    issues = this.deduplicateIssues(issues);

    // Determine board columns and label-to-column mapping
    const { columnNames, listLabels } = await this.resolveColumns(settings, headers, BaseURL, projectId);

    const tasks = issues.map((issue: any) => this.issueToTask(issue, settings, listLabels));

    await Promise.all(
      VaultHelper.createTaskNotes(normalizedFolderPath, tasks, settings.noteTemplate, settings.noteName, this.app)
    ).catch((e) => VaultHelper.logError(e));

    if (settings.createKanban) {
      await VaultHelper.createKanbanBoard(
        normalizedFolderPath,
        tasks,
        columnNames,
        milestoneIdentifier.toString(),
        settings.teamLeaderMode,
        this.app
      ).catch((e) => VaultHelper.logError(e));
    }
  }

  private async updateBoardMode(
    settings: AgileTaskNotesSettings,
    headers: any,
    BaseURL: string,
    projectId: string
  ): Promise<void> {
    const normalizedBaseFolderPath = normalizePath(settings.targetFolder);
    const completedFolder = settings.targetFolder + '/Completed/';
    const normalizedCompletedFolderPath = normalizePath(completedFolder);

    VaultHelper.createFoldersFromList([normalizedBaseFolderPath, normalizedCompletedFolderPath], this.app);

    // Fetch all issues (open and closed)
    let issues: any[] = [];

    if (settings.teamLeaderMode) {
      issues = await this.fetchAllIssues(
        `${BaseURL}/projects/${projectId}/issues?state=all&per_page=100`,
        headers
      );
    } else {
      const usernames = settings.gitlabSettings.usernames.split(',').map((u: string) => u.trim());

      const issueArrays = await Promise.all(
        usernames.map((username: string) =>
          this.fetchAllIssues(
            `${BaseURL}/projects/${projectId}/issues?state=all&assignee_username=${encodeURIComponent(username)}&per_page=100`,
            headers
          )
        )
      );
      issues = issueArrays.flat();
    }

    issues = this.deduplicateIssues(issues);

    const { columnNames, listLabels } = await this.resolveColumns(settings, headers, BaseURL, projectId);

    const activeTasks: Task[] = [];
    const completedTasks: Task[] = [];

    issues.forEach((issue: any) => {
      const task = this.issueToTask(issue, settings, listLabels);
      if (issue.state === 'closed') {
        completedTasks.push(task);
      } else {
        activeTasks.push(task);
      }
    });

    // Create markdown files
    await Promise.all(
      VaultHelper.createTaskNotes(normalizedBaseFolderPath, activeTasks, settings.noteTemplate, settings.noteName, this.app)
    );
    await Promise.all(
      VaultHelper.createTaskNotes(
        normalizedCompletedFolderPath,
        completedTasks,
        settings.noteTemplate,
        settings.noteName,
        this.app
      )
    );

    // Move pre-existing notes between folders based on state
    const completedTaskNoteFiles = completedTasks
      .map((task) => VaultHelper.getFileByTaskId(settings.targetFolder, task.id, this.app))
      .filter((file): file is TFile => !!file);
    completedTaskNoteFiles.forEach((file) =>
      this.app.vault.rename(file, normalizePath(completedFolder + file.name))
    );
    const activeTaskNoteFiles = activeTasks
      .map((task) => VaultHelper.getFileByTaskId(settings.targetFolder, task.id, this.app))
      .filter((file): file is TFile => !!file);
    activeTaskNoteFiles.forEach((file) =>
      this.app.vault.rename(file, normalizePath(settings.targetFolder + '/' + file.name))
    );

    if (settings.createKanban) {
      await VaultHelper.createKanbanBoard(
        normalizedBaseFolderPath,
        activeTasks.concat(completedTasks),
        columnNames,
        settings.gitlabSettings.boardId || 'board',
        settings.teamLeaderMode,
        this.app
      );
    }
  }

  private async updateUserMode(
    settings: AgileTaskNotesSettings,
    headers: any,
    BaseURL: string,
    _projectId: string
  ): Promise<void> {
    // Fetch all issues assigned to user(s) across all projects using the global issues endpoint
    const stateFilter = settings.gitlabSettings.excludeClosed ? 'opened' : 'all';
    let issues: any[] = [];

    if (settings.teamLeaderMode) {
      issues = await this.fetchAllIssues(
        `${BaseURL}/issues?scope=all&state=${stateFilter}&per_page=100`,
        headers
      );
    } else {
      const usernames = settings.gitlabSettings.usernames.split(',').map((u: string) => u.trim());

      const issueArrays = await Promise.all(
        usernames.map((username: string) =>
          this.fetchAllIssues(
            `${BaseURL}/issues?scope=all&assignee_username=${encodeURIComponent(username)}&state=${stateFilter}&per_page=100`,
            headers
          )
        )
      );
      issues = issueArrays.flat();
    }

    issues = this.deduplicateIssues(issues);

    // In user mode there is no project context, so columns come from the manual setting only
    const columnNames = settings.gitlabSettings.columns.split(',').map((c: string) => c.trim());
    const listLabels = columnNames.filter((c) => c !== 'Open' && c !== 'Closed');

    // Build tasks with their target date-folder
    const taskEntries: { task: Task; folderPath: string }[] = issues.map((issue: any) => ({
      task: this.issueToTask(issue, settings, listLabels),
      folderPath: this.getDateFolderPath(settings.targetFolder, issue.created_at),
    }));

    // Pre-filter: skip tasks that already have a note anywhere under targetFolder.
    // Use a synthetic path so getFileByTaskId's projectPath resolves to the entire targetFolder.
    const searchPath = normalizePath(settings.targetFolder + '/_search');
    const newTaskEntries = taskEntries.filter(
      ({ task }) => VaultHelper.getFileByTaskId(searchPath, task.id, this.app) === undefined
    );

    // Group new tasks by their date-folder
    const tasksByFolder = new Map<string, Task[]>();
    newTaskEntries.forEach(({ task, folderPath }) => {
      if (!tasksByFolder.has(folderPath)) {
        tasksByFolder.set(folderPath, []);
      }
      tasksByFolder.get(folderPath)!.push(task);
    });

    // Create folders and notes per date-folder
    for (const [folderPath, tasks] of tasksByFolder) {
      VaultHelper.createFolders(folderPath, this.app);
      await Promise.all(
        VaultHelper.createTaskNotes(folderPath, tasks, settings.noteTemplate, settings.noteName, this.app)
      ).catch((e) => VaultHelper.logError(e));
    }

    if (settings.createKanban) {
      const normalizedBaseFolderPath = normalizePath(settings.targetFolder);
      VaultHelper.createFolders(normalizedBaseFolderPath, this.app);
      const allTasks = taskEntries.map(({ task }) => task);
      await VaultHelper.createKanbanBoard(
        normalizedBaseFolderPath,
        allTasks,
        columnNames,
        'all-issues',
        settings.teamLeaderMode,
        this.app
      ).catch((e) => VaultHelper.logError(e));
    }
  }

  private static MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  /**
   * Computes a date-based folder path: targetFolder/YYYY/QN/MonthName
   */
  private getDateFolderPath(targetFolder: string, createdAt: string): string {
    const date = new Date(createdAt);
    const year = date.getFullYear();
    const monthIndex = date.getMonth();
    const quarter = Math.floor(monthIndex / 3) + 1;
    const monthName = GitlabClient.MONTH_NAMES[monthIndex];

    return normalizePath(`${targetFolder}/${year}/Q${quarter}/${monthName}`);
  }

  /**
   * Fetches all issues from a paginated GitLab API endpoint
   */
  private async fetchAllIssues(baseUrl: string, headers: any): Promise<any[]> {
    let allIssues: any[] = [];
    let page = 1;

    while (true) {
      const separator = baseUrl.includes('?') ? '&' : '?';
      const response = await requestUrl({
        method: 'GET',
        headers: headers,
        url: `${baseUrl}${separator}page=${page}`,
      });

      allIssues = allIssues.concat(response.json);

      // GitLab returns up to per_page results; fewer means last page
      if (response.json.length < 100) break;
      page++;
    }

    return allIssues;
  }

  /**
   * Deduplicates issues by iid (can occur when querying multiple usernames for co-assigned issues)
   */
  private deduplicateIssues(issues: any[]): any[] {
    const seen = new Set<number>();
    return issues.filter((issue: any) => {
      if (seen.has(issue.iid)) return false;
      seen.add(issue.iid);
      return true;
    });
  }

  /**
   * Resolves the board column names and list labels.
   * If a board ID is configured, fetches columns from the GitLab board API.
   * Otherwise, uses the manually configured columns setting.
   */
  private async resolveColumns(
    settings: AgileTaskNotesSettings,
    headers: any,
    BaseURL: string,
    projectId: string
  ): Promise<{ columnNames: string[]; listLabels: string[] }> {
    if (settings.gitlabSettings.boardId) {
      return this.fetchBoardColumns(BaseURL, projectId, settings.gitlabSettings.boardId, headers);
    }

    const columnNames = settings.gitlabSettings.columns.split(',').map((c: string) => c.trim());
    const listLabels = columnNames.filter((c) => c !== 'Open' && c !== 'Closed');
    return { columnNames, listLabels };
  }

  /**
   * Fetches board list configuration from GitLab and builds the full column list.
   * GitLab boards have implicit "Open" and "Closed" columns plus label-based lists.
   */
  private async fetchBoardColumns(
    BaseURL: string,
    projectId: string,
    boardId: string,
    headers: any
  ): Promise<{ columnNames: string[]; listLabels: string[] }> {
    const listsResponse = await requestUrl({
      method: 'GET',
      headers: headers,
      url: `${BaseURL}/projects/${projectId}/boards/${boardId}/lists`,
    });

    // Sort lists by position (GitLab returns them in order, but be safe)
    const sortedLists = listsResponse.json.sort((a: any, b: any) => a.position - b.position);
    const listLabels = sortedLists.map((list: any) => list.label.name);

    // GitLab boards always have implicit Open (backlog) and Closed columns
    const columnNames = ['Open', ...listLabels, 'Closed'];

    return { columnNames, listLabels };
  }

  /**
   * Converts a GitLab issue API response object into a Task.
   * Determines the board column state based on issue labels matching board list labels.
   */
  private issueToTask(issue: any, settings: AgileTaskNotesSettings, boardListLabels: string[]): Task {
    // Determine assignee display name
    let assigneeName = 'Unassigned';
    if (issue.assignees && issue.assignees.length > 0) {
      assigneeName = issue.assignees[0].name;
    } else if (issue.assignee) {
      assigneeName = issue.assignee.name;
    }

    // Determine board column state based on labels
    let boardState = 'Open';
    if (issue.state === 'closed') {
      boardState = 'Closed';
    } else {
      for (const label of boardListLabels) {
        if (issue.labels && issue.labels.includes(label)) {
          boardState = label;
          break;
        }
      }
    }

    // Format labels as space-separated tags
    let tags = '';
    if (issue.labels && issue.labels.length > 0) {
      tags = issue.labels.map((label: string) => label.replace(/\s+/g, '-')).join(' ');
    }

    // Determine issue type
    const issueType = issue.issue_type
      ? issue.issue_type.charAt(0).toUpperCase() + issue.issue_type.slice(1)
      : 'Issue';

    // Format due date
    let dueDate = '';
    if (issue.due_date) {
      const tempDate = new Date(issue.due_date);
      dueDate = !isNaN(tempDate.getTime()) ? tempDate.toLocaleDateString('en-GB') : '';
    }

    const description = issue.description ? issue.description : 'No description provided';

    return new Task(
      issue.iid.toString(),
      boardState,
      issue.title,
      issueType,
      assigneeName,
      issue.web_url,
      description,
      undefined,
      undefined,
      dueDate,
      tags
    );
  }

  public setupSettings(
    container: HTMLElement,
    plugin: AgileTaskNotesPlugin,
    settingsTab: AgileTaskNotesPluginSettingTab
  ): any {
    container.createEl('h2', { text: 'GitLab Remote Repo Settings' });

    new Setting(container)
      .setName('Instance URL')
      .setDesc('Your GitLab instance hostname (e.g. gitlab.com or gitlab.yourcompany.com)')
      .addText((text) =>
        text
          .setPlaceholder('gitlab.com')
          .setValue(plugin.settings.gitlabSettings.baseUrl)
          .onChange(async (value) => {
            plugin.settings.gitlabSettings.baseUrl = value;
            await plugin.saveSettings();
          })
      );

    new Setting(container)
      .setName('Personal Access Token')
      .setDesc('A GitLab Personal Access Token with read_api scope')
      .addText((text) =>
        text
          .setPlaceholder('Enter your PAT')
          .setValue(plugin.settings.gitlabSettings.accessToken)
          .onChange(async (value) => {
            plugin.settings.gitlabSettings.accessToken = value;
            await plugin.saveSettings();
          })
      );

    new Setting(container)
      .setName('Usernames')
      .setDesc(
        'A comma-separated list of GitLab usernames you want tasks for. Put your username if you only need your own.'
      )
      .addText((text) =>
        text
          .setPlaceholder('Enter usernames')
          .setValue(plugin.settings.gitlabSettings.usernames)
          .onChange(async (value) => {
            plugin.settings.gitlabSettings.usernames = value;
            await plugin.saveSettings();
          })
      );

    new Setting(container)
      .setName('Mode')
      .setDesc(
        'Milestones: groups issues by active milestone (sprints). Board: shows all project issues. User: fetches all assigned issues across all projects into date-based folders (Year/Quarter/Month).'
      )
      .addDropdown((dropdown) => {
        dropdown.addOption('milestones', 'Milestones');
        dropdown.addOption('board', 'Board');
        dropdown.addOption('user', 'User');
        dropdown.setValue(plugin.settings.gitlabSettings.mode).onChange(async (value) => {
          plugin.settings.gitlabSettings.mode = value;
          await plugin.saveSettings();
          settingsTab.display();
        });
      });

    if (plugin.settings.gitlabSettings.mode !== 'user') {
      new Setting(container)
        .setName('Project ID')
        .setDesc('The numeric project ID or URL-encoded path (e.g. 12345 or mygroup%2Fmyproject). Found on the project homepage.')
        .addText((text) =>
          text
            .setPlaceholder('Enter project ID or path')
            .setValue(plugin.settings.gitlabSettings.projectId)
            .onChange(async (value) => {
              plugin.settings.gitlabSettings.projectId = value;
              await plugin.saveSettings();
            })
        );

      new Setting(container)
        .setName('Board ID')
        .setDesc(
          'The ID of your GitLab issue board (optional). If set, column names are fetched automatically from the board. Found in the board URL.'
        )
        .addText((text) =>
          text
            .setPlaceholder('Enter Board ID')
            .setValue(plugin.settings.gitlabSettings.boardId)
            .onChange(async (value) => {
              plugin.settings.gitlabSettings.boardId = value;
              await plugin.saveSettings();
            })
        );
    }

    if (plugin.settings.gitlabSettings.mode === 'user') {
      new Setting(container)
        .setName('Exclude Closed Issues')
        .setDesc('Only pull issues that are not closed')
        .addToggle((toggle) =>
          toggle.setValue(plugin.settings.gitlabSettings.excludeClosed).onChange(async (value) => {
            plugin.settings.gitlabSettings.excludeClosed = value;
            await plugin.saveSettings();
          })
        );
    }

    if (plugin.settings.gitlabSettings.mode === 'milestones') {
      new Setting(container)
        .setName('Use Milestone Name (rather than ID)')
        .setDesc("Uses the milestone's title for the folder name instead of its numeric ID")
        .addToggle((toggle) =>
          toggle.setValue(plugin.settings.gitlabSettings.useMilestoneName).onChange(async (value) => {
            plugin.settings.gitlabSettings.useMilestoneName = value;
            await plugin.saveSettings();
          })
        );
    }

    if (plugin.settings.gitlabSettings.mode !== 'user' && !plugin.settings.gitlabSettings.boardId) {
      new Setting(container)
        .setName('Column Names')
        .setDesc(
          'Comma-separated list of column names for the Kanban board. Must include "Open" and "Closed". Middle columns should match your GitLab labels. (Only used when Board ID is not set.)'
        )
        .addText((text) =>
          text
            .setPlaceholder('Open,In Progress,Review,Closed')
            .setValue(plugin.settings.gitlabSettings.columns)
            .onChange(async (value) => {
              plugin.settings.gitlabSettings.columns = value;
              await plugin.saveSettings();
            })
        );
    }
  }
}
