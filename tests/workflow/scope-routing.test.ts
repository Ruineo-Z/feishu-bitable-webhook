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
  scopeType: 'table' | null,
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

test('table 作用域候选应全部命中 source=table', () => {
  const tableWorkflowA = createWorkflowRecord(
    'wf_table_a',
    'table-workflow-a',
    createConfig('appA', 'tbl1'),
    'table',
    'appA',
    'tbl1',
  );

  const tableWorkflowB = createWorkflowRecord(
    'wf_table_b',
    'table-workflow-b',
    createConfig('appA', 'tbl1'),
    'table',
    'appA',
    'tbl1',
  );

  const candidates = buildScopedWorkflowCandidates({
    tableScoped: [tableWorkflowA, tableWorkflowB],
  });

  expect(candidates).toHaveLength(2);
  expect(candidates[0].source).toBe('table');
  expect(candidates[1].source).toBe('table');

  const stats = summarizeWorkflowCandidateSources(candidates);
  expect(stats.table).toBe(2);
});

test('无候选时返回空数组', () => {
  const candidates = buildScopedWorkflowCandidates({
    tableScoped: [],
  });

  expect(candidates).toHaveLength(0);

  const stats = summarizeWorkflowCandidateSources(candidates);
  expect(stats.table).toBe(0);
});
