import {
  WorkflowRecord,
  buildScopedWorkflowCandidates,
  summarizeWorkflowCandidateSources,
} from '../../src/db/workflows';
import {
  WorkflowEventType,
  resolveWorkflowEventTypes,
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

function createWorkflowRecord(
  id: string,
  name: string,
  config: WorkflowConfig,
  triggerActions: WorkflowEventType[] | null,
): WorkflowRecord {
  return {
    id,
    name,
    config,
    is_active: true,
    scope_type: 'table',
    app_token: 'appA',
    table_id: 'tbl1',
    trigger_actions: triggerActions,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function createConfig(action?: string | string[]): WorkflowConfig {
  const triggerConfig: Record<string, unknown> = {
    app_token: 'appA',
    table_id: 'tbl1',
  };

  if (Array.isArray(action)) {
    triggerConfig.actions = action;
  } else if (typeof action === 'string') {
    triggerConfig.action = action;
  }

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

function matchByEvent(workflow: WorkflowRecord, eventType: WorkflowEventType): boolean {
  const resolved = resolveWorkflowEventTypes({
    trigger_actions: workflow.trigger_actions,
    config: workflow.config,
  });

  if (!resolved.eventTypes || resolved.eventTypes.length === 0) {
    return true;
  }

  return resolved.eventTypes.includes(eventType);
}

console.log('Workflow Scope Routing Tests\n');

test('table 作用域候选应全部命中 source=table', () => {
  const tableWorkflowA = createWorkflowRecord(
    'wf_table_a',
    'table-workflow-a',
    createConfig(),
    null,
  );

  const tableWorkflowB = createWorkflowRecord(
    'wf_table_b',
    'table-workflow-b',
    createConfig(),
    ['record_updated'],
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

test('配置 eventTypes 时，仅匹配对应事件', () => {
  const workflow = createWorkflowRecord(
    'wf_event_only_create',
    'create-only',
    createConfig('record_created'),
    ['record_created'],
  );

  expect(matchByEvent(workflow, 'record_created')).toBe(true);
  expect(matchByEvent(workflow, 'record_updated')).toBe(false);
});

test('未配置 eventTypes 时，保持 wildcard 匹配语义', () => {
  const workflow = createWorkflowRecord(
    'wf_event_wildcard',
    'wildcard',
    createConfig(),
    null,
  );

  expect(matchByEvent(workflow, 'record_created')).toBe(true);
  expect(matchByEvent(workflow, 'record_updated')).toBe(true);
  expect(matchByEvent(workflow, 'record_deleted')).toBe(true);
});

test('仅存在 legacy trigger action 时，运行时兜底过滤应生效', () => {
  const workflow = createWorkflowRecord(
    'wf_event_legacy_action',
    'legacy-action',
    createConfig(['add', 'update']),
    null,
  );

  const resolved = resolveWorkflowEventTypes({
    trigger_actions: workflow.trigger_actions,
    config: workflow.config,
  });

  expect(resolved.eventTypes).toEqual(['record_created', 'record_updated']);
  expect(matchByEvent(workflow, 'record_created')).toBe(true);
  expect(matchByEvent(workflow, 'record_deleted')).toBe(false);
});
