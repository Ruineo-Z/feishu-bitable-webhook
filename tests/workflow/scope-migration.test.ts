import { buildWorkflowScopeBackfillPlan } from '../../src/workflow/scope';
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

function createConfig(appToken?: string, tableId?: string): WorkflowConfig {
  const triggerConfig: Record<string, unknown> = {};
  if (appToken) triggerConfig.app_token = appToken;
  if (tableId) triggerConfig.table_id = tableId;

  return {
    id: `wf-${Math.random().toString(36).slice(2)}`,
    name: 'migration-test',
    trigger: {
      type: 'lark.bitable.record.changed',
      config: triggerConfig,
    },
    steps: [],
  };
}

console.log('Workflow Scope Migration Tests\n');

test('回填计划应仅产出可推导的 table 作用域更新，并记录无法迁移项', () => {
  const plan = buildWorkflowScopeBackfillPlan([
    {
      id: 'wf_1',
      name: 'legacy-table',
      config: createConfig('appA', 'tbl1'),
      scope_type: null,
      app_token: null,
      table_id: null,
    },
    {
      id: 'wf_2',
      name: 'legacy-global',
      config: createConfig(),
      scope_type: null,
      app_token: null,
      table_id: null,
    },
    {
      id: 'wf_3',
      name: 'legacy-partial',
      config: createConfig('appOnly', undefined),
      scope_type: null,
      app_token: null,
      table_id: null,
    },
    {
      id: 'wf_4',
      name: 'explicit-table-valid',
      config: createConfig('appX', 'tblX'),
      scope_type: 'table',
      app_token: 'appX',
      table_id: 'tblX',
    },
    {
      id: 'wf_5',
      name: 'explicit-table-invalid',
      config: createConfig('appY', 'tblY'),
      scope_type: 'table',
      app_token: 'appY',
      table_id: null,
    },
  ]);

  expect(plan.updates).toHaveLength(2);
  expect(plan.audit.tableScoped).toHaveLength(2);
  expect(plan.audit.anomalies).toHaveLength(2);
});

test('回填输出只包含 table 更新字段，缺失绑定会进入异常清单', () => {
  const plan = buildWorkflowScopeBackfillPlan([
    {
      id: 'wf_table',
      name: 'legacy-table',
      config: createConfig('appA', 'tbl1'),
      scope_type: null,
      app_token: null,
      table_id: null,
    },
    {
      id: 'wf_unbound',
      name: 'legacy-unbound',
      config: createConfig(),
      scope_type: null,
      app_token: null,
      table_id: null,
    },
  ]);

  const tableUpdate = plan.updates.find((item) => item.id === 'wf_table');
  const unboundUpdate = plan.updates.find((item) => item.id === 'wf_unbound');

  expect(tableUpdate?.scope_type).toBe('table');
  expect(tableUpdate?.app_token).toBe('appA');
  expect(tableUpdate?.table_id).toBe('tbl1');

  expect(unboundUpdate).toBe(undefined);
  expect(plan.audit.anomalies).toHaveLength(1);
});
