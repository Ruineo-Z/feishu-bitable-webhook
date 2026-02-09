import {
  WorkflowRecord,
  buildScopedWorkflowCandidates,
  summarizeWorkflowCandidateSources,
} from '../../src/db/workflows';
import { WorkflowConfig } from '../../src/workflow/types';

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.log(`✗ ${name}`);
    console.error(error);
    process.exit(1);
  }
}

function expect(actual: unknown) {
  return {
    toBe(expected: unknown) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
      }
    },
    toHaveLength(expected: number) {
      if (!Array.isArray(actual)) {
        throw new Error(`Expected array but got ${typeof actual}`);
      }
      if (actual.length !== expected) {
        throw new Error(`Expected length ${expected} but got ${actual.length}`);
      }
    },
  };
}

function createWorkflowRecord(
  id: string,
  name: string,
  config: WorkflowConfig,
  scopeType: 'table' | 'global' | null,
  appToken: string | null,
  tableId: string | null,
): WorkflowRecord {
  return {
    id,
    name,
    config,
    is_active: true,
    scope_type: scopeType,
    app_token: appToken,
    table_id: tableId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function createConfig(appToken?: string, tableId?: string): WorkflowConfig {
  const triggerConfig: Record<string, unknown> = {};
  if (appToken) triggerConfig.app_token = appToken;
  if (tableId) triggerConfig.table_id = tableId;

  return {
    id: `wf-${Math.random().toString(36).slice(2)}`,
    name: 'test-workflow',
    trigger: {
      type: 'lark.bitable.record.changed',
      config: triggerConfig,
    },
    steps: [],
  };
}

console.log('Workflow Scope Routing Tests\n');

test('table 作用域候选应命中 source=table', () => {
  const tableWorkflow = createWorkflowRecord(
    'wf_table',
    'table-workflow',
    createConfig('appA', 'tbl1'),
    'table',
    'appA',
    'tbl1',
  );

  const candidates = buildScopedWorkflowCandidates({
    tableScoped: [tableWorkflow],
    globalScoped: [],
    legacyScoped: [],
    appToken: 'appA',
    tableId: 'tbl1',
  });

  expect(candidates).toHaveLength(1);
  expect(candidates[0].source).toBe('table');
});

test('global 作用域候选应命中 source=global', () => {
  const globalWorkflow = createWorkflowRecord(
    'wf_global',
    'global-workflow',
    createConfig(),
    'global',
    null,
    null,
  );

  const candidates = buildScopedWorkflowCandidates({
    tableScoped: [],
    globalScoped: [globalWorkflow],
    legacyScoped: [],
    appToken: 'appA',
    tableId: 'tbl1',
  });

  expect(candidates).toHaveLength(1);
  expect(candidates[0].source).toBe('global');
});

test('混合候选应同时包含 table、global 与 legacy-fallback', () => {
  const tableWorkflow = createWorkflowRecord(
    'wf_table_mix',
    'table-workflow',
    createConfig('appA', 'tbl1'),
    'table',
    'appA',
    'tbl1',
  );

  const globalWorkflow = createWorkflowRecord(
    'wf_global_mix',
    'global-workflow',
    createConfig(),
    'global',
    null,
    null,
  );

  const legacyWorkflow = createWorkflowRecord(
    'wf_legacy_mix',
    'legacy-workflow',
    createConfig('appA', 'tbl1'),
    null,
    null,
    null,
  );

  const candidates = buildScopedWorkflowCandidates({
    tableScoped: [tableWorkflow],
    globalScoped: [globalWorkflow],
    legacyScoped: [legacyWorkflow],
    appToken: 'appA',
    tableId: 'tbl1',
  });

  expect(candidates).toHaveLength(3);

  const stats = summarizeWorkflowCandidateSources(candidates);
  expect(stats.table).toBe(1);
  expect(stats.global).toBe(1);
  expect(stats['legacy-fallback']).toBe(1);
});

test('legacy fallback 仅在旧配置匹配时命中', () => {
  const legacyMatched = createWorkflowRecord(
    'wf_legacy_matched',
    'legacy-matched',
    createConfig('appA', 'tbl1'),
    null,
    null,
    null,
  );

  const legacyMismatched = createWorkflowRecord(
    'wf_legacy_mismatch',
    'legacy-mismatch',
    createConfig('appB', 'tbl9'),
    null,
    null,
    null,
  );

  const candidates = buildScopedWorkflowCandidates({
    tableScoped: [],
    globalScoped: [],
    legacyScoped: [legacyMatched, legacyMismatched],
    appToken: 'appA',
    tableId: 'tbl1',
  });

  expect(candidates).toHaveLength(1);
  expect(candidates[0].workflow.id).toBe('wf_legacy_matched');
  expect(candidates[0].source).toBe('legacy-fallback');
});
