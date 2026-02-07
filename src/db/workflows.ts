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

export interface WorkflowFilter {
  isActive?: boolean;
  limit?: number;
  offset?: number;
}

export const workflowsDb = {
  /**
   * Fetch all active workflows (internal use for engine)
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
   * Find workflows with pagination and filtering
   */
  async findAll(filter: WorkflowFilter = {}): Promise<{ data: WorkflowRecord[]; total: number }> {
    let query = getSupabase()
      .from('workflows')
      .select('*', { count: 'exact' });

    if (filter.isActive !== undefined) {
      query = query.eq('is_active', filter.isActive);
    }

    // Handle pagination range
    const limit = filter.limit || 50;
    const offset = filter.offset || 0;

    query = query.range(offset, offset + limit - 1);

    // Default sort by created_at desc
    query = query.order('created_at', { ascending: false });

    const { data, error, count } = await query;

    if (error) throw error;

    return {
      data: (data || []) as WorkflowRecord[],
      total: count || 0
    };
  },

  /**
   * Find workflow by ID
   */
  async findById(id: string): Promise<WorkflowRecord | null> {
    const { data, error } = await getSupabase()
      .from('workflows')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
        if (error.code === 'PGRST116') return null; // Not found
        throw error;
    }
    return data as WorkflowRecord;
  },

  /**
   * Create a new workflow
   */
  async create(name: string, config: WorkflowConfig, isActive = true): Promise<WorkflowRecord> {
    const { data, error } = await getSupabase()
      .from('workflows')
      .insert({
        name,
        config,
        is_active: isActive
      })
      .select()
      .single();

    if (error) throw error;
    return data as WorkflowRecord;
  },

  /**
   * Update a workflow
   */
  async update(id: string, updates: Partial<Pick<WorkflowRecord, 'name' | 'config' | 'is_active'>>): Promise<WorkflowRecord | null> {
    const { data, error } = await getSupabase()
      .from('workflows')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
    }
    return data as WorkflowRecord;
  },

  /**
   * Delete a workflow
   */
  async delete(id: string): Promise<boolean> {
    const { error } = await getSupabase()
      .from('workflows')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return true;
  }
};
