import {
  buildWorkflowScopeBackfillPlan,
  buildWorkflowTriggerActionsBackfillPlan,
} from '../../src/workflow/scope';
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
    toEqual(expected: unknown) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
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

function createConfig(appToken?: string, tableId?: string, action?: string | string[]): WorkflowConfig {
  const triggerConfig: Record<string, unknown> = {};
  if (appToken) triggerConfig.app_token = appToken;
  if (tableId) triggerConfig.table_id = tableId;

  if (typeof action === 'string') {
    triggerConfig.action = action;
  }

  if (Array.isArray(action)) {
    triggerConfig.actions = action;
  }

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

test('scope 回填计划应仅产出可推导的 table 作用域更新，并记录无法迁移项', () => {
  const plan = buildWorkflowScopeBackfillPlan([
    {
      id: 'wf_1',
      name: 'legacy-table',
      config: createConfig('appA', 'tbl1'),
      scope_type: null,
      app_token: null,
      table_id: null,
      trigger_actions: null,
    },
    {
      id: 'wf_2',
      name: 'legacy-global',
      config: createConfig(),
      scope_type: null,
      app_token: null,
      table_id: null,
      trigger_actions: null,
    },
    {
      id: 'wf_3',
      name: 'legacy-partial',
      config: createConfig('appOnly', undefined),
      scope_type: null,
      app_token: null,
      table_id: null,
      trigger_actions: null,
    },
    {
      id: 'wf_4',
      name: 'explicit-table-valid',
      config: createConfig('appX', 'tblX'),
      scope_type: 'table',
      app_token: 'appX',
      table_id: 'tblX',
      trigger_actions: null,
    },
    {
      id: 'wf_5',
      name: 'explicit-table-invalid',
      config: createConfig('appY', 'tblY', 'record_updated'),
      scope_type: 'table',
      app_token: 'appY',
      table_id: null,
      trigger_actions: null,
    },
  ]);

  expect(plan.updates).toHaveLength(2);
  expect(plan.audit.tableScoped).toHaveLength(2);
  expect(plan.audit.anomalies).toHaveLength(2);

  const wf5 = plan.updates.find((item) => item.id === 'wf_5');
  expect(wf5?.trigger_actions).toEqual(['record_updated']);
});

test('事件过滤回填应归一化 trigger config 并区分 wildcard/anomaly', () => {
  const plan = buildWorkflowTriggerActionsBackfillPlan([
    {
      id: 'wf_action_single',
      name: 'single-action',
      config: createConfig('appA', 'tbl1', 'add'),
      trigger_actions: null,
    },
    {
      id: 'wf_action_multi',
      name: 'multi-action',
      config: createConfig('appA', 'tbl1', ['update', 'remove']),
      trigger_actions: null,
    },
    {
      id: 'wf_wildcard',
      name: 'wildcard',
      config: createConfig('appA', 'tbl1'),
      trigger_actions: null,
    },
    {
      id: 'wf_invalid',
      name: 'invalid-action',
      config: createConfig('appA', 'tbl1', 'mystery_action'),
      trigger_actions: ['mystery_action' as any],
    },
  ]);

  expect(plan.updates).toHaveLength(3);
  expect(plan.audit.backfilled).toHaveLength(2);
  expect(plan.audit.wildcard).toHaveLength(2);
  expect(plan.audit.anomalies).toHaveLength(1);

  const single = plan.updates.find((item) => item.id === 'wf_action_single');
  const multi = plan.updates.find((item) => item.id === 'wf_action_multi');
  const wildcard = plan.updates.find((item) => item.id === 'wf_wildcard');

  expect(single?.trigger_actions).toEqual(['record_created']);
  expect(multi?.trigger_actions).toEqual(['record_updated', 'record_deleted']);
  expect(wildcard).toBe(undefined);
});
