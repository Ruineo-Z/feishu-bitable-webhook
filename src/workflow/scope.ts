import { WorkflowConfig } from './types';

export const WORKFLOW_EVENT_TYPES = ['record_created', 'record_updated', 'record_deleted'] as const;

export type WorkflowEventType = (typeof WORKFLOW_EVENT_TYPES)[number];

const WORKFLOW_EVENT_TYPE_ORDER = new Map<WorkflowEventType, number>(
  WORKFLOW_EVENT_TYPES.map((eventType, index) => [eventType, index]),
);

const WORKFLOW_EVENT_TYPE_ALIASES: Record<string, WorkflowEventType> = {
  record_created: 'record_created',
  record_added: 'record_created',
  add: 'record_created',
  record_updated: 'record_updated',
  record_edited: 'record_updated',
  update: 'record_updated',
  record_deleted: 'record_deleted',
  remove: 'record_deleted',
  delete: 'record_deleted',
};

export const WORKFLOW_SCOPE_TABLE_BINDING_REQUIRED = 'WORKFLOW_SCOPE_TABLE_BINDING_REQUIRED';
export const WORKFLOW_SCOPE_TRIGGER_EVENT_TYPES_CONFLICT = 'WORKFLOW_SCOPE_TRIGGER_EVENT_TYPES_CONFLICT';
export const WORKFLOW_SCOPE_EVENT_TYPES_INVALID = 'WORKFLOW_SCOPE_EVENT_TYPES_INVALID';

export type WorkflowScopeType = 'table';

export interface TableWorkflowScopeInput {
  type: 'table';
  appToken: string;
  tableId: string;
  eventTypes?: WorkflowEventType[];
}

export type WorkflowScopeInput = TableWorkflowScopeInput;

export interface WorkflowScopeDbFields {
  scope_type: WorkflowScopeType;
  app_token: string;
  table_id: string;
  trigger_actions: WorkflowEventType[] | null;
}

export interface WorkflowScopeRecordLike {
  scope_type?: string | null;
  app_token?: string | null;
  table_id?: string | null;
  trigger_actions?: string[] | null;
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
  eventTypes: WorkflowEventType[] | null;
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

export interface WorkflowTriggerActionsBackfillSourceRow {
  id: string;
  name: string;
  config: WorkflowConfig;
  trigger_actions?: string[] | null;
}

export interface WorkflowTriggerActionsBackfillUpdate {
  id: string;
  trigger_actions: WorkflowEventType[] | null;
}

export interface WorkflowTriggerActionsBackfillAuditBackfilledItem {
  id: string;
  name: string;
  eventTypes: WorkflowEventType[];
  reason:
    | 'legacy_trigger_config'
    | 'existing_trigger_actions_normalized';
}

export interface WorkflowTriggerActionsBackfillAuditWildcardItem {
  id: string;
  name: string;
  reason:
    | 'no_explicit_filter'
    | 'legacy_filter_empty_after_normalization';
}

export interface WorkflowTriggerActionsBackfillAnomaly {
  id: string;
  name: string;
  reason: string;
  invalidValues: string[];
}

export interface WorkflowTriggerActionsBackfillPlan {
  updates: WorkflowTriggerActionsBackfillUpdate[];
  audit: {
    backfilled: WorkflowTriggerActionsBackfillAuditBackfilledItem[];
    wildcard: WorkflowTriggerActionsBackfillAuditWildcardItem[];
    anomalies: WorkflowTriggerActionsBackfillAnomaly[];
  };
}

export interface WorkflowEventTypeNormalizationResult {
  eventTypes: WorkflowEventType[];
  invalidValues: string[];
  hadInput: boolean;
}

export interface WorkflowTriggerEventTypes {
  eventTypes: WorkflowEventType[] | null;
  invalidValues: string[];
  hasExplicitFilter: boolean;
}

export interface ResolvedWorkflowEventTypes {
  eventTypes: WorkflowEventType[] | null;
  invalidValues: string[];
  source: 'structured' | 'trigger-config' | 'none';
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function toReadableInvalidValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function uniqueOrderedEventTypes(eventTypes: WorkflowEventType[]): WorkflowEventType[] {
  const unique = Array.from(new Set(eventTypes));
  return unique.sort(
    (a, b) => (WORKFLOW_EVENT_TYPE_ORDER.get(a) || 0) - (WORKFLOW_EVENT_TYPE_ORDER.get(b) || 0),
  );
}

export function normalizeWorkflowEventType(value: unknown): WorkflowEventType | null {
  const normalizedText = normalizeText(value);
  if (!normalizedText) return null;

  return WORKFLOW_EVENT_TYPE_ALIASES[normalizedText.toLowerCase()] || null;
}

export function normalizeWorkflowEventTypes(value: unknown): WorkflowEventTypeNormalizationResult {
  const rawValues = Array.isArray(value)
    ? value
    : value === undefined || value === null
      ? []
      : [value];

  const normalized: WorkflowEventType[] = [];
  const invalidValues: string[] = [];

  for (const item of rawValues) {
    const normalizedEventType = normalizeWorkflowEventType(item);
    if (normalizedEventType) {
      normalized.push(normalizedEventType);
      continue;
    }

    const normalizedText = normalizeText(item);
    if (normalizedText) {
      invalidValues.push(normalizedText);
      continue;
    }

    if (item !== undefined && item !== null) {
      invalidValues.push(toReadableInvalidValue(item));
    }
  }

  return {
    eventTypes: uniqueOrderedEventTypes(normalized),
    invalidValues: Array.from(new Set(invalidValues)),
    hadInput: rawValues.length > 0,
  };
}

function collectRawTriggerEventTypeValues(config: WorkflowConfig | null | undefined): unknown[] {
  const triggerConfig = (config as any)?.trigger?.config;
  if (!triggerConfig || typeof triggerConfig !== 'object') {
    return [];
  }

  const normalizedConfig = triggerConfig as Record<string, unknown>;
  const candidates = [
    normalizedConfig.action,
    normalizedConfig.actions,
    normalizedConfig.eventType,
    normalizedConfig.eventTypes,
  ];

  const values: unknown[] = [];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      values.push(...candidate);
      continue;
    }

    if (candidate !== undefined && candidate !== null) {
      values.push(candidate);
    }
  }

  return values;
}

export function extractWorkflowEventTypesFromTriggerConfig(config: WorkflowConfig | null | undefined): WorkflowTriggerEventTypes {
  const rawValues = collectRawTriggerEventTypeValues(config);
  const normalized = normalizeWorkflowEventTypes(rawValues);

  return {
    eventTypes: normalized.eventTypes.length > 0 ? normalized.eventTypes : null,
    invalidValues: normalized.invalidValues,
    hasExplicitFilter: normalized.hadInput,
  };
}

export function normalizeEventTypesForStorage(eventTypes: WorkflowEventType[] | null | undefined): WorkflowEventType[] | null {
  if (!eventTypes || eventTypes.length === 0) return null;
  return uniqueOrderedEventTypes(eventTypes);
}

function areEventTypeSetsEqual(
  left: WorkflowEventType[] | null | undefined,
  right: WorkflowEventType[] | null | undefined,
): boolean {
  const normalizedLeft = normalizeEventTypesForStorage(left);
  const normalizedRight = normalizeEventTypesForStorage(right);

  if (!normalizedLeft && !normalizedRight) return true;
  if (!normalizedLeft || !normalizedRight) return false;
  if (normalizedLeft.length !== normalizedRight.length) return false;

  return normalizedLeft.every((eventType, index) => eventType === normalizedRight[index]);
}

export function inferScopeFromWorkflowConfig(config: WorkflowConfig): WorkflowScopeInput | null {
  const triggerConfig = (config as any)?.trigger?.config as Record<string, unknown> | undefined;
  const appToken = normalizeText(triggerConfig?.app_token);
  const tableId = normalizeText(triggerConfig?.table_id);

  if (!appToken || !tableId) {
    return null;
  }

  const triggerEventTypes = extractWorkflowEventTypesFromTriggerConfig(config);

  const scope: WorkflowScopeInput = {
    type: 'table',
    appToken,
    tableId,
  };

  if (triggerEventTypes.eventTypes) {
    scope.eventTypes = triggerEventTypes.eventTypes;
  }

  return scope;
}

export function resolveWorkflowEventTypes(record: {
  trigger_actions?: string[] | null;
  config?: WorkflowConfig | null;
}): ResolvedWorkflowEventTypes {
  const structured = normalizeWorkflowEventTypes(record.trigger_actions);
  const fromTriggerConfig = extractWorkflowEventTypesFromTriggerConfig(record.config || null);

  const invalidValues = Array.from(
    new Set([...structured.invalidValues, ...fromTriggerConfig.invalidValues]),
  );

  if (structured.eventTypes.length > 0) {
    return {
      eventTypes: structured.eventTypes,
      invalidValues,
      source: 'structured',
    };
  }

  if (fromTriggerConfig.eventTypes) {
    return {
      eventTypes: fromTriggerConfig.eventTypes,
      invalidValues,
      source: 'trigger-config',
    };
  }

  return {
    eventTypes: null,
    invalidValues,
    source: 'none',
  };
}

export function toDbScopeFields(scope: WorkflowScopeInput): WorkflowScopeDbFields {
  return {
    scope_type: 'table',
    app_token: scope.appToken,
    table_id: scope.tableId,
    trigger_actions: normalizeEventTypesForStorage(scope.eventTypes),
  };
}

export function resolveScopeFromRecord(record: WorkflowScopeRecordLike): WorkflowScopeInput {
  const explicitScopeType = normalizeText(record.scope_type);
  const explicitAppToken = normalizeText(record.app_token);
  const explicitTableId = normalizeText(record.table_id);

  let scope: WorkflowScopeInput | null = null;

  if (explicitScopeType === 'table' && explicitAppToken && explicitTableId) {
    scope = {
      type: 'table',
      appToken: explicitAppToken,
      tableId: explicitTableId,
    };
  } else if (record.config) {
    scope = inferScopeFromWorkflowConfig(record.config);
  }

  if (!scope) {
    throw new Error(WORKFLOW_SCOPE_TABLE_BINDING_REQUIRED);
  }

  const resolvedEventTypes = resolveWorkflowEventTypes({
    trigger_actions: record.trigger_actions,
    config: record.config,
  });

  if (resolvedEventTypes.eventTypes) {
    scope.eventTypes = resolvedEventTypes.eventTypes;
  }

  return scope;
}

function cloneTriggerConfig(config: WorkflowConfig): {
  triggerType: string;
  triggerConfig: Record<string, unknown>;
} {
  const fallbackTriggerType = 'lark.bitable.record.changed';
  const originalTrigger = config.trigger || { type: fallbackTriggerType, config: {} };
  const triggerType = originalTrigger.type || fallbackTriggerType;
  const triggerConfig = ((originalTrigger.config || {}) as Record<string, unknown>);

  return {
    triggerType,
    triggerConfig: { ...triggerConfig },
  };
}

function normalizeScopeBinding(scope: WorkflowScopeInput): WorkflowScopeInput {
  const appToken = normalizeText(scope.appToken);
  const tableId = normalizeText(scope.tableId);

  if (!appToken || !tableId) {
    throw new Error(WORKFLOW_SCOPE_TABLE_BINDING_REQUIRED);
  }

  const eventTypeNormalization = normalizeWorkflowEventTypes(scope.eventTypes);
  if (eventTypeNormalization.invalidValues.length > 0) {
    throw new Error(WORKFLOW_SCOPE_EVENT_TYPES_INVALID);
  }

  const normalizedScope: WorkflowScopeInput = {
    type: 'table',
    appToken,
    tableId,
  };

  if (eventTypeNormalization.eventTypes.length > 0) {
    normalizedScope.eventTypes = eventTypeNormalization.eventTypes;
  }

  return normalizedScope;
}

export function applyScopeToWorkflowConfig(
  config: WorkflowConfig,
  scope: WorkflowScopeInput,
): WorkflowConfig {
  const normalizedScope = normalizeScopeBinding(scope);
  const { triggerType, triggerConfig } = cloneTriggerConfig(config);

  triggerConfig.app_token = normalizedScope.appToken;
  triggerConfig.table_id = normalizedScope.tableId;

  delete triggerConfig.action;
  delete triggerConfig.actions;
  delete triggerConfig.eventType;
  delete triggerConfig.eventTypes;

  const normalizedEventTypes = normalizeEventTypesForStorage(normalizedScope.eventTypes);
  if (normalizedEventTypes) {
    triggerConfig.eventTypes = normalizedEventTypes;
    triggerConfig.actions = normalizedEventTypes;
    triggerConfig.action = normalizedEventTypes.length === 1 ? normalizedEventTypes[0] : undefined;
  }

  return {
    ...config,
    trigger: {
      type: triggerType,
      config: triggerConfig,
    },
  };
}

export function normalizeScopeAndTriggerConfig(
  config: WorkflowConfig,
  scope: WorkflowScopeInput,
  options?: {
    strictConflict?: boolean;
  },
): { scope: WorkflowScopeInput; config: WorkflowConfig } {
  const normalizedScope = normalizeScopeBinding(scope);
  const triggerEventTypes = extractWorkflowEventTypesFromTriggerConfig(config);

  if (triggerEventTypes.invalidValues.length > 0) {
    throw new Error(WORKFLOW_SCOPE_EVENT_TYPES_INVALID);
  }

  const scopeEventTypes = normalizeEventTypesForStorage(normalizedScope.eventTypes);
  const strictConflict = options?.strictConflict !== false;

  if (strictConflict && scopeEventTypes && triggerEventTypes.eventTypes && !areEventTypeSetsEqual(scopeEventTypes, triggerEventTypes.eventTypes)) {
    throw new Error(WORKFLOW_SCOPE_TRIGGER_EVENT_TYPES_CONFLICT);
  }

  const resolvedEventTypes = scopeEventTypes || triggerEventTypes.eventTypes;

  const mergedScope: WorkflowScopeInput = {
    type: 'table',
    appToken: normalizedScope.appToken,
    tableId: normalizedScope.tableId,
  };

  if (resolvedEventTypes) {
    mergedScope.eventTypes = resolvedEventTypes;
  }

  return {
    scope: mergedScope,
    config: applyScopeToWorkflowConfig(config, mergedScope),
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

    const isExplicitTableValid =
      explicitScopeType === 'table' && !!explicitAppToken && !!explicitTableId;

    if (isExplicitTableValid) {
      continue;
    }

    const inferredScope = inferScopeFromWorkflowConfig(row.config);

    if (inferredScope) {
      const dbScopeFields = toDbScopeFields(inferredScope);
      updates.push({
        id: row.id,
        ...dbScopeFields,
      });

      audit.tableScoped.push({
        id: row.id,
        name: row.name,
        scopeType: 'table',
        appToken: dbScopeFields.app_token,
        tableId: dbScopeFields.table_id,
        eventTypes: dbScopeFields.trigger_actions,
        reason: explicitScopeType ? 'invalid_existing_scope_repaired' : 'legacy_trigger_binding',
      });
      continue;
    }

    const triggerConfig = (row.config as any)?.trigger?.config as Record<string, unknown> | undefined;
    const legacyAppToken = normalizeText(triggerConfig?.app_token);
    const legacyTableId = normalizeText(triggerConfig?.table_id);

    const hasPartialLegacyBinding =
      (legacyAppToken && !legacyTableId) ||
      (!legacyAppToken && legacyTableId);

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

function shouldUpdateTriggerActions(
  current: string[] | null | undefined,
  expected: WorkflowEventType[] | null,
): boolean {
  const normalizedCurrent = normalizeWorkflowEventTypes(current);

  if (normalizedCurrent.invalidValues.length > 0) {
    return true;
  }

  return !areEventTypeSetsEqual(normalizedCurrent.eventTypes, expected);
}

export function buildWorkflowTriggerActionsBackfillPlan(
  rows: WorkflowTriggerActionsBackfillSourceRow[],
): WorkflowTriggerActionsBackfillPlan {
  const updates: WorkflowTriggerActionsBackfillUpdate[] = [];
  const audit: WorkflowTriggerActionsBackfillPlan['audit'] = {
    backfilled: [],
    wildcard: [],
    anomalies: [],
  };

  for (const row of rows) {
    const existingNormalization = normalizeWorkflowEventTypes(row.trigger_actions);
    const triggerEventTypes = extractWorkflowEventTypesFromTriggerConfig(row.config);

    const invalidValues = Array.from(
      new Set([...existingNormalization.invalidValues, ...triggerEventTypes.invalidValues]),
    );

    if (invalidValues.length > 0) {
      audit.anomalies.push({
        id: row.id,
        name: row.name,
        reason: 'contains unsupported event type values',
        invalidValues,
      });
    }

    const desiredTriggerActions = triggerEventTypes.eventTypes || null;

    if (shouldUpdateTriggerActions(row.trigger_actions || null, desiredTriggerActions)) {
      updates.push({
        id: row.id,
        trigger_actions: desiredTriggerActions,
      });
    }

    if (desiredTriggerActions && desiredTriggerActions.length > 0) {
      audit.backfilled.push({
        id: row.id,
        name: row.name,
        eventTypes: desiredTriggerActions,
        reason: triggerEventTypes.hasExplicitFilter
          ? 'legacy_trigger_config'
          : 'existing_trigger_actions_normalized',
      });
      continue;
    }

    audit.wildcard.push({
      id: row.id,
      name: row.name,
      reason: triggerEventTypes.hasExplicitFilter
        ? 'legacy_filter_empty_after_normalization'
        : 'no_explicit_filter',
    });
  }

  return {
    updates,
    audit,
  };
}
