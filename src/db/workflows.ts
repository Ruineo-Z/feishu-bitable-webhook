import { getSupabase } from './client';
import { WorkflowConfig } from '../workflow/types';
import {
  WorkflowEventType,
  WorkflowScopeInput,
  WorkflowScopeType,
  toDbScopeFields,
} from '../workflow/scope';

export interface WorkflowRecord {
  id: string;
  name: string;
  config: WorkflowConfig;
  is_active: boolean;
  scope_type: WorkflowScopeType | null;
  app_token: string | null;
  table_id: string | null;
  trigger_actions: WorkflowEventType[] | null;
  created_at: string;
  updated_at: string;
}

export interface WorkflowSummaryRecord {
  id: string;
  name: string;
  is_active: boolean;
  scope_type: WorkflowScopeType | null;
  app_token: string | null;
  table_id: string | null;
  trigger_actions: WorkflowEventType[] | null;
  created_at: string;
  updated_at: string;
}

export interface WorkflowFilter {
  isActive?: boolean;
  limit?: number;
  offset?: number;
}

export type WorkflowMatchSource = 'table';

export interface WorkflowCandidate {
  workflow: WorkflowRecord;
  source: WorkflowMatchSource;
}

export interface WorkflowCandidateBuildInput {
  tableScoped: WorkflowRecord[];
}

export function buildScopedWorkflowCandidates(input: WorkflowCandidateBuildInput): WorkflowCandidate[] {
  return input.tableScoped.map((workflow) => ({
    workflow,
    source: 'table' as const,
  }));
}

export function summarizeWorkflowCandidateSources(candidates: WorkflowCandidate[]): Record<WorkflowMatchSource, number> {
  return candidates.reduce(
    (acc, candidate) => {
      acc[candidate.source] += 1;
      return acc;
    },
    {
      table: 0,
    } as Record<WorkflowMatchSource, number>,
  );
}

function buildEventTypeRoutingOrFilter(eventType: WorkflowEventType): string {
  return `trigger_actions.is.null,trigger_actions.cs.{${eventType}}`;
}

export const workflowsDb = {
  /**
   * Fetch all active workflows
   */
  async findActive(): Promise<WorkflowConfig[]> {
    const { data, error } = await getSupabase()
      .from('workflows')
      .select('config')
      .eq('is_active', true)
      .eq('scope_type', 'table')
      .not('app_token', 'is', null)
      .not('table_id', 'is', null);

    if (error) {
      console.error('Failed to fetch active workflows:', error);
      throw error;
    }

    return (data || []).map((row: any) => row.config as WorkflowConfig);
  },

  /**
   * Find workflows with pagination and filtering
   */
  async findAll(filter: WorkflowFilter = {}): Promise<{ data: WorkflowSummaryRecord[]; total: number }> {
    let query = getSupabase()
      .from('workflows')
      .select('id,name,is_active,scope_type,app_token,table_id,trigger_actions,created_at,updated_at', { count: 'exact' });

    query = query
      .eq('scope_type', 'table')
      .not('app_token', 'is', null)
      .not('table_id', 'is', null);

    if (filter.isActive !== undefined) {
      query = query.eq('is_active', filter.isActive);
    }

    const limit = filter.limit || 50;
    const offset = filter.offset || 0;

    query = query.range(offset, offset + limit - 1);
    query = query.order('created_at', { ascending: false });

    const { data, error, count } = await query;

    if (error) throw error;

    return {
      data: (data || []) as WorkflowSummaryRecord[],
      total: count || 0,
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
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    if (data.scope_type !== 'table' || !data.app_token || !data.table_id) {
      return null;
    }

    return data as WorkflowRecord;
  },

  /**
   * Find event candidates by table scope
   */
  async findCandidatesByScope(
    appToken: string,
    tableId: string,
    eventType?: WorkflowEventType,
  ): Promise<WorkflowCandidate[]> {
    let query = getSupabase()
      .from('workflows')
      .select('*')
      .eq('is_active', true)
      .eq('scope_type', 'table')
      .eq('app_token', appToken)
      .eq('table_id', tableId)
      .order('created_at', { ascending: true });

    if (eventType) {
      query = query.or(buildEventTypeRoutingOrFilter(eventType));
    }

    const tableScopedResult = await query;

    if (tableScopedResult.error) throw tableScopedResult.error;

    return buildScopedWorkflowCandidates({
      tableScoped: (tableScopedResult.data || []) as WorkflowRecord[],
    });
  },

  /**
   * Create a new workflow
   */
  async create(
    name: string,
    config: WorkflowConfig,
    isActive = true,
    scope: WorkflowScopeInput,
  ): Promise<WorkflowRecord> {
    const scopeFields = toDbScopeFields(scope);

    const { data, error } = await getSupabase()
      .from('workflows')
      .insert({
        name,
        config,
        is_active: isActive,
        ...scopeFields,
      })
      .select()
      .single();

    if (error) throw error;
    return data as WorkflowRecord;
  },

  /**
   * Update a workflow
   */
  async update(
    id: string,
    updates: Partial<
      Pick<
        WorkflowRecord,
        'name' | 'config' | 'is_active' | 'scope_type' | 'app_token' | 'table_id' | 'trigger_actions'
      >
    >,
  ): Promise<WorkflowRecord | null> {
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
    const { data, error } = await getSupabase()
      .from('workflows')
      .delete()
      .eq('id', id)
      .select('id')
      .maybeSingle();

    if (error) throw error;
    return !!data;
  },
};
