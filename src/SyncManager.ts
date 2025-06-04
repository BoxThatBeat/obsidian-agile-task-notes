import { App, Notice } from 'obsidian';
import { Task } from './Task';

export interface SyncState {
  taskId: string;
  lastLocalUpdate: Date;
  lastRemoteUpdate: Date;
  localHash: string;
  remoteHash: string;
}

export interface SyncConflict {
  taskId: string;
  localTask: Task;
  remoteTask: Task;
  conflictType: 'both-modified' | 'deleted-remotely' | 'deleted-locally';
}

export interface SyncResult {
  synced: number;
  conflicts: SyncConflict[];
  errors: string[];
}

export class SyncManager {
  private syncStateFile = '.obsidian/plugins/agile-task-notes/sync-state.json';
  private syncStates: Map<string, SyncState> = new Map();

  constructor(private app: App) {
    this.loadSyncState();
  }

  private async loadSyncState(): Promise<void> {
    try {
      const adapter = this.app.vault.adapter;
      if (await adapter.exists(this.syncStateFile)) {
        const content = await adapter.read(this.syncStateFile);
        const states = JSON.parse(content);
        this.syncStates = new Map(Object.entries(states));
        console.log(`Loaded sync state with ${this.syncStates.size} task states`);
      }
    } catch (error) {
      console.error('Failed to load sync state:', error);
    }
  }

  private async saveSyncState(): Promise<void> {
    try {
      const adapter = this.app.vault.adapter;
      const dir = this.syncStateFile.substring(0, this.syncStateFile.lastIndexOf('/'));
      if (!(await adapter.exists(dir))) {
        await adapter.mkdir(dir);
      }
      const states = Object.fromEntries(this.syncStates);
      await adapter.write(this.syncStateFile, JSON.stringify(states, null, 2));
    } catch (error) {
      console.error('Failed to save sync state:', error);
    }
  }

  public getSyncState(taskId: string): SyncState | undefined {
    return this.syncStates.get(taskId);
  }

  public updateSyncState(taskId: string, state: SyncState): void {
    this.syncStates.set(taskId, state);
    this.saveSyncState();
  }

  public removeSyncState(taskId: string): void {
    this.syncStates.delete(taskId);
    this.saveSyncState();
  }

  private calculateHash(task: Task): string {
    // Simple hash based on task properties that matter for sync
    const content = `${task.state}|${task.title}|${task.desc}|${task.assignedTo}`;
    return this.simpleHash(content);
  }

  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(16);
  }

  public detectConflicts(localTasks: Task[], remoteTasks: Task[]): SyncConflict[] {
    const conflicts: SyncConflict[] = [];
    const remoteTaskMap = new Map(remoteTasks.map(t => [t.id, t]));

    for (const localTask of localTasks) {
      const syncState = this.getSyncState(localTask.id);
      const remoteTask = remoteTaskMap.get(localTask.id);

      if (!remoteTask) {
        // Task exists locally but not remotely
        if (syncState && syncState.remoteHash) {
          // Task was deleted remotely
          conflicts.push({
            taskId: localTask.id,
            localTask,
            remoteTask: localTask, // placeholder
            conflictType: 'deleted-remotely'
          });
        }
        continue;
      }

      if (syncState) {
        const localHash = this.calculateHash(localTask);
        const remoteHash = this.calculateHash(remoteTask);

        const localModified = localHash !== syncState.localHash;
        const remoteModified = remoteHash !== syncState.remoteHash;

        if (localModified && remoteModified) {
          conflicts.push({
            taskId: localTask.id,
            localTask,
            remoteTask,
            conflictType: 'both-modified'
          });
        }
      }
    }

    return conflicts;
  }

  public updateAfterSync(task: Task, isLocal: boolean): void {
    const hash = this.calculateHash(task);
    const syncState = this.getSyncState(task.id) || {
      taskId: task.id,
      lastLocalUpdate: new Date(),
      lastRemoteUpdate: new Date(),
      localHash: hash,
      remoteHash: hash
    };

    if (isLocal) {
      syncState.lastLocalUpdate = new Date();
      syncState.localHash = hash;
    } else {
      syncState.lastRemoteUpdate = new Date();
      syncState.remoteHash = hash;
    }

    this.updateSyncState(task.id, syncState);
  }

  public showSyncResult(result: SyncResult): void {
    if (result.conflicts.length === 0 && result.errors.length === 0) {
      new Notice(`Sync completed successfully. ${result.synced} tasks synchronized.`);
    } else {
      let message = `Sync completed with issues:\n`;
      message += `- ${result.synced} tasks synchronized\n`;
      if (result.conflicts.length > 0) {
        message += `- ${result.conflicts.length} conflicts detected\n`;
      }
      if (result.errors.length > 0) {
        message += `- ${result.errors.length} errors occurred`;
      }
      new Notice(message, 5000);
    }
  }
}