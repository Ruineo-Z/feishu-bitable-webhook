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
  });

  expect(candidates).toHaveLength(1);
  expect(candidates[0].source).toBe('global');
});

test('混合候选应同时包含 table 与 global', () => {
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

  const candidates = buildScopedWorkflowCandidates({
    tableScoped: [tableWorkflow],
    globalScoped: [globalWorkflow],
  });

  expect(candidates).toHaveLength(2);

  const stats = summarizeWorkflowCandidateSources(candidates);
  expect(stats.table).toBe(1);
  expect(stats.global).toBe(1);
});
