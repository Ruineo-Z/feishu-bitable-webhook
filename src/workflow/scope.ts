import { WorkflowConfig } from './types';

export type WorkflowScopeType = 'table';

export interface TableWorkflowScopeInput {
  type: 'table';
  appToken: string;
  tableId: string;
}

export type WorkflowScopeInput = TableWorkflowScopeInput;

export interface WorkflowScopeDbFields {
  scope_type: WorkflowScopeType;
  app_token: string;
  table_id: string;
}

export interface WorkflowScopeRecordLike {
  scope_type?: string | null;
  app_token?: string | null;
  table_id?: string | null;
  config?: WorkflowConfig | null;
}

export interface ScopeBackfillSourceRow extends WorkflowScopeRecordLike {
  id: string;
  name: string;
  config: WorkflowConfig;
}

export interface ScopeBackfillUpdate extends WorkflowScopeDbFields {
  id: string;
}

export interface ScopeBackfillAuditItem {
  id: string;
  name: string;
  scopeType: 'table';
  appToken: string;
  tableId: string;
  reason:
    | 'legacy_trigger_binding'
    | 'invalid_existing_scope_repaired';
}

export interface ScopeBackfillAnomaly {
  id: string;
  name: string;
  reason: string;
}

export interface ScopeBackfillPlan {
  updates: ScopeBackfillUpdate[];
  audit: {
    tableScoped: ScopeBackfillAuditItem[];
    anomalies: ScopeBackfillAnomaly[];
  };
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function extractLegacyBinding(config: WorkflowConfig | null | undefined): {
  appToken: string | null;
  tableId: string | null;
} {
  const triggerConfig = (config as any)?.trigger?.config as Record<string, unknown> | undefined;

  return {
    appToken: normalizeText(triggerConfig?.app_token),
    tableId: normalizeText(triggerConfig?.table_id),
  };
}

export function inferScopeFromWorkflowConfig(config: WorkflowConfig): WorkflowScopeInput | null {
  const legacyBinding = extractLegacyBinding(config);

  if (!legacyBinding.appToken || !legacyBinding.tableId) {
    return null;
  }

  return {
    type: 'table',
    appToken: legacyBinding.appToken,
    tableId: legacyBinding.tableId,
  };
}

export function toDbScopeFields(scope: WorkflowScopeInput): WorkflowScopeDbFields {
  return {
    scope_type: 'table',
    app_token: scope.appToken,
    table_id: scope.tableId,
  };
}

export function resolveScopeFromRecord(record: WorkflowScopeRecordLike): WorkflowScopeInput {
  const explicitScopeType = normalizeText(record.scope_type);
  const explicitAppToken = normalizeText(record.app_token);
  const explicitTableId = normalizeText(record.table_id);

  if (explicitScopeType === 'table' && explicitAppToken && explicitTableId) {
    return {
      type: 'table',
      appToken: explicitAppToken,
      tableId: explicitTableId,
    };
  }

  if (record.config) {
    const inferredScope = inferScopeFromWorkflowConfig(record.config);
    if (inferredScope) {
      return inferredScope;
    }
  }

  throw new Error('WORKFLOW_SCOPE_TABLE_BINDING_REQUIRED');
}

export function applyScopeToWorkflowConfig(
  config: WorkflowConfig,
  scope: WorkflowScopeInput,
): WorkflowConfig {
  const originalTrigger = config.trigger || { type: 'lark.bitable.record.changed', config: {} };
  const originalTriggerConfig = (originalTrigger.config || {}) as Record<string, unknown>;

  return {
    ...config,
    trigger: {
      ...originalTrigger,
      config: {
        ...originalTriggerConfig,
        app_token: scope.appToken,
        table_id: scope.tableId,
      },
    },
  };
}

export function buildWorkflowScopeBackfillPlan(rows: ScopeBackfillSourceRow[]): ScopeBackfillPlan {
  const updates: ScopeBackfillUpdate[] = [];
  const audit: ScopeBackfillPlan['audit'] = {
    tableScoped: [],
    anomalies: [],
  };

  for (const row of rows) {
    const explicitScopeType = normalizeText(row.scope_type);
    const explicitAppToken = normalizeText(row.app_token);
    const explicitTableId = normalizeText(row.table_id);
    const legacyBinding = extractLegacyBinding(row.config);

    const isExplicitTableValid =
      explicitScopeType === 'table' && !!explicitAppToken && !!explicitTableId;

    if (isExplicitTableValid) {
      continue;
    }

    if (legacyBinding.appToken && legacyBinding.tableId) {
      updates.push({
        id: row.id,
        scope_type: 'table',
        app_token: legacyBinding.appToken,
        table_id: legacyBinding.tableId,
      });

      audit.tableScoped.push({
        id: row.id,
        name: row.name,
        scopeType: 'table',
        appToken: legacyBinding.appToken,
        tableId: legacyBinding.tableId,
        reason: explicitScopeType ? 'invalid_existing_scope_repaired' : 'legacy_trigger_binding',
      });
      continue;
    }

    const hasPartialLegacyBinding =
      (legacyBinding.appToken && !legacyBinding.tableId) ||
      (!legacyBinding.appToken && legacyBinding.tableId);

    audit.anomalies.push({
      id: row.id,
      name: row.name,
      reason: hasPartialLegacyBinding
        ? 'legacy trigger binding is partial, table scope cannot be inferred'
        : 'missing table binding, manual migration required',
    });
  }

  return { updates, audit };
}
