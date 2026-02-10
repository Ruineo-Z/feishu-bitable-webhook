import { WorkflowConfig } from './types';

export type WorkflowScopeType = 'table' | 'global';

export interface TableWorkflowScopeInput {
  type: 'table';
  appToken: string;
  tableId: string;
}

export interface GlobalWorkflowScopeInput {
  type: 'global';
}

export type WorkflowScopeInput = TableWorkflowScopeInput | GlobalWorkflowScopeInput;

export interface WorkflowScopeDbFields {
  scope_type: WorkflowScopeType;
  app_token: string | null;
  table_id: string | null;
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
  scopeType: WorkflowScopeType;
  appToken: string | null;
  tableId: string | null;
  reason:
    | 'legacy_trigger_binding'
    | 'legacy_trigger_missing_binding'
    | 'legacy_trigger_partial_binding'
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
    globalScoped: ScopeBackfillAuditItem[];
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

export function inferScopeFromWorkflowConfig(config: WorkflowConfig): WorkflowScopeInput {
  const legacyBinding = extractLegacyBinding(config);

  if (legacyBinding.appToken && legacyBinding.tableId) {
    return {
      type: 'table',
      appToken: legacyBinding.appToken,
      tableId: legacyBinding.tableId,
    };
  }

  return { type: 'global' };
}

export function toDbScopeFields(scope: WorkflowScopeInput): WorkflowScopeDbFields {
  if (scope.type === 'table') {
    return {
      scope_type: 'table',
      app_token: scope.appToken,
      table_id: scope.tableId,
    };
  }

  return {
    scope_type: 'global',
    app_token: null,
    table_id: null,
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

  if (explicitScopeType === 'global') {
    return { type: 'global' };
  }

  if (record.config) {
    return inferScopeFromWorkflowConfig(record.config);
  }

  return { type: 'global' };
}

export function applyScopeToWorkflowConfig(
  config: WorkflowConfig,
  scope: WorkflowScopeInput,
): WorkflowConfig {
  const originalTrigger = config.trigger || { type: 'lark.bitable.record.changed', config: {} };
  const originalTriggerConfig = (originalTrigger.config || {}) as Record<string, unknown>;
  const nextTriggerConfig: Record<string, unknown> = { ...originalTriggerConfig };

  if (scope.type === 'table') {
    nextTriggerConfig.app_token = scope.appToken;
    nextTriggerConfig.table_id = scope.tableId;
  } else {
    delete nextTriggerConfig.app_token;
    delete nextTriggerConfig.table_id;
  }

  return {
    ...config,
    trigger: {
      ...originalTrigger,
      config: nextTriggerConfig,
    },
  };
}

export function buildWorkflowScopeBackfillPlan(rows: ScopeBackfillSourceRow[]): ScopeBackfillPlan {
  const updates: ScopeBackfillUpdate[] = [];
  const audit: ScopeBackfillPlan['audit'] = {
    tableScoped: [],
    globalScoped: [],
    anomalies: [],
  };

  for (const row of rows) {
    const explicitScopeType = normalizeText(row.scope_type);
    const explicitAppToken = normalizeText(row.app_token);
    const explicitTableId = normalizeText(row.table_id);
    const legacyBinding = extractLegacyBinding(row.config);

    const hasPartialLegacyBinding =
      (legacyBinding.appToken && !legacyBinding.tableId) ||
      (!legacyBinding.appToken && legacyBinding.tableId);

    if (hasPartialLegacyBinding) {
      audit.anomalies.push({
        id: row.id,
        name: row.name,
        reason: 'legacy trigger binding is partial, fallback to global scope',
      });
    }

    const isExplicitTableValid =
      explicitScopeType === 'table' && !!explicitAppToken && !!explicitTableId;
    const isExplicitGlobalValid = explicitScopeType === 'global';

    if (isExplicitTableValid || isExplicitGlobalValid) {
      continue;
    }

    if (explicitScopeType && !isExplicitTableValid && !isExplicitGlobalValid) {
      audit.anomalies.push({
        id: row.id,
        name: row.name,
        reason: `invalid existing scope_type=${explicitScopeType}, will repair`,
      });
    }

    const inferredScope = inferScopeFromWorkflowConfig(row.config);
    const scopeFields = toDbScopeFields(inferredScope);

    updates.push({
      id: row.id,
      ...scopeFields,
    });

    if (inferredScope.type === 'table') {
      audit.tableScoped.push({
        id: row.id,
        name: row.name,
        scopeType: 'table',
        appToken: inferredScope.appToken,
        tableId: inferredScope.tableId,
        reason: explicitScopeType
          ? 'invalid_existing_scope_repaired'
          : 'legacy_trigger_binding',
      });
      continue;
    }

    audit.globalScoped.push({
      id: row.id,
      name: row.name,
      scopeType: 'global',
      appToken: null,
      tableId: null,
      reason: hasPartialLegacyBinding
        ? 'legacy_trigger_partial_binding'
        : explicitScopeType
          ? 'invalid_existing_scope_repaired'
          : 'legacy_trigger_missing_binding',
    });
  }

  return { updates, audit };
}
