import { WorkflowEngine } from '../../src/workflow/core/engine'
import { PluginRegistry } from '../../src/workflow/core/registry'
import { ConditionPlugin } from '../../src/workflow/plugins/condition'
import { IWorkflowPlugin, WorkflowConfig, WorkflowContext, StepResult } from '../../src/workflow/types'

function expect(actual: unknown) {
  return {
    toBe(expected: unknown) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`)
      }
    },
    toBeUndefined() {
      if (actual !== undefined) {
        throw new Error(`Expected undefined but got ${JSON.stringify(actual)}`)
      }
    },
  }
}

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn()
    console.log(`✓ ${name}`)
  } catch (error) {
    console.log(`✗ ${name}`)
    console.error(error)
    process.exit(1)
  }
}

class CounterPlugin implements IWorkflowPlugin {
  constructor(private readonly counter: { count: number }) {}

  async execute(_context: WorkflowContext, _config: Record<string, unknown>): Promise<StepResult> {
    this.counter.count += 1
    return {
      success: true,
      output: {
        code: 'OK',
        durationMs: 0,
      },
    }
  }
}

function buildWorkflow(): WorkflowConfig {
  return {
    id: 'wf_sync_owner_a_to_b_001',
    name: 'A负责人变更同步到B',
    trigger: {
      type: 'lark.bitable.record.changed',
      config: {
        app_token: 'app_demo',
        table_id: 'table_a',
        actions: ['record_updated'],
      },
    },
    steps: [
      {
        id: 'c1',
        type: 'condition',
        name: '负责人变化且昵称非空',
        config: {
          logic: 'AND',
          expressions: [
            { field: '账号第一负责人', operator: 'changed', source: 'after' },
            { field: '账号当前昵称', operator: 'exists', source: 'after' },
          ],
        },
        onTrue: 'd1',
        onFalse: 'end',
      },
      {
        id: 'd1',
        type: 'action.bitable.delete',
        name: '旧负责人有值才删除',
        templatePolicy: 'skip',
        when: {
          logic: 'AND',
          expressions: [{ field: '账号第一负责人', operator: 'exists', source: 'before' }],
        },
        config: {
          app_token: 'app_demo',
          table_id: 'table_b',
          filter: {
            conjunction: 'and',
            conditions: [],
          },
        },
        next: 'c2',
      },
      {
        id: 'c2',
        type: 'condition',
        name: '变更后负责人有值才创建',
        config: {
          logic: 'AND',
          expressions: [{ field: '账号第一负责人', operator: 'exists', source: 'after' }],
        },
        onTrue: 'a1',
        onFalse: 'end',
      },
      {
        id: 'a1',
        type: 'action.bitable.create',
        templatePolicy: 'fail',
        config: {
          app_token: 'app_demo',
          table_id: 'table_b',
          fields: {},
        },
        next: 'end',
      },
      {
        id: 'end',
        type: 'condition',
        config: {
          logic: 'AND',
          expressions: [{ field: '账号当前昵称', operator: 'exists', source: 'after' }],
        },
      },
    ],
  }
}

async function run() {
  console.log('A->B Owner Sync Regression Tests\n')

  const registry = PluginRegistry.getInstance()
  registry.register('condition', new ConditionPlugin())

  await test('旧值为空时不删除且不报错，after 有值可创建', async () => {
    const deleteCounter = { count: 0 }
    const createCounter = { count: 0 }
    registry.register('action.bitable.delete', new CounterPlugin(deleteCounter))
    registry.register('action.bitable.create', new CounterPlugin(createCounter))

    const engine = new WorkflowEngine()
    const context = await engine.execute(buildWorkflow(), {
      traceId: 'owner-sync-case-1',
      record: {
        fields: {
          账号第一负责人: [{ id: 'ou_new' }],
          账号当前昵称: '昵称A',
        },
        beforeFields: {
          账号第一负责人: [],
          账号当前昵称: '昵称A',
        },
      },
    })

    expect(context.steps.d1.success).toBe(true)
    expect(context.steps.d1.skipped).toBe(true)
    expect(deleteCounter.count).toBe(0)
    expect(createCounter.count).toBe(1)
  })

  await test('旧值有值时会删除，after 为空时不创建', async () => {
    const deleteCounter = { count: 0 }
    const createCounter = { count: 0 }
    registry.register('action.bitable.delete', new CounterPlugin(deleteCounter))
    registry.register('action.bitable.create', new CounterPlugin(createCounter))

    const engine = new WorkflowEngine()
    const context = await engine.execute(buildWorkflow(), {
      traceId: 'owner-sync-case-2',
      record: {
        fields: {
          账号第一负责人: [],
          账号当前昵称: '昵称A',
        },
        beforeFields: {
          账号第一负责人: [{ id: 'ou_old' }],
          账号当前昵称: '昵称A',
        },
      },
    })

    expect(deleteCounter.count).toBe(1)
    expect(createCounter.count).toBe(0)
    expect(context.steps.a1).toBeUndefined()
    expect(context.steps.c2.success).toBe(true)
  })
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
