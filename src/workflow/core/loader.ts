import { workflowsDb } from '../../db/workflows';
import { WorkflowConfig } from '../types';

export class WorkflowLoader {
  private static instance: WorkflowLoader;
  private cache: WorkflowConfig[] = [];
  private lastFetchTime = 0;
  private TTL = 60 * 1000; // 1 minute cache

  private constructor() {}

  public static getInstance(): WorkflowLoader {
    if (!WorkflowLoader.instance) {
      WorkflowLoader.instance = new WorkflowLoader();
    }
    return WorkflowLoader.instance;
  }

  public async loadActiveWorkflows(forceRefresh = false): Promise<WorkflowConfig[]> {
    const now = Date.now();
    if (forceRefresh || now - this.lastFetchTime > this.TTL) {
      try {
        this.cache = await workflowsDb.findActive();
        this.lastFetchTime = now;
        console.log(`[WorkflowLoader] Loaded ${this.cache.length} active workflows`);
      } catch (error) {
        console.error('[WorkflowLoader] Failed to refresh workflows:', error);
        // On error, return stale cache if available
        if (this.cache.length === 0) throw error;
      }
    }
    return this.cache;
  }
}
