import { getSupabase } from './client';
import { WorkflowConfig } from '../workflow/types';

export interface WorkflowRecord {
  id: string;
  name: string;
  config: WorkflowConfig;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export const workflowsDb = {
  /**
   * Fetch all active workflows
   */
  async findActive(): Promise<WorkflowConfig[]> {
    const { data, error } = await getSupabase()
      .from('workflows')
      .select('config')
      .eq('is_active', true);

    if (error) {
      console.error('Failed to fetch active workflows:', error);
      throw error;
    }

    return (data || []).map((row: any) => row.config as WorkflowConfig);
  },

  /**
   * Create a new workflow
   */
  async create(name: string, config: WorkflowConfig): Promise<WorkflowRecord> {
    const { data, error } = await getSupabase()
      .from('workflows')
      .insert({
        name,
        config
      })
      .select()
      .single();

    if (error) {
        throw error;
    }
    return data as WorkflowRecord;
  }
};
