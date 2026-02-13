import { WorkflowEngine } from '../../src/workflow/core/engine'
import { registerStandardPlugins } from '../../src/workflow/plugins'
import { WorkflowConfig } from '../../src/workflow/types'

function expect(actual: unknown) {
  return {
    toBe(expected: unknown) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`)
      }
    },
    toBeGreaterThan(expected: number) {
      if (typeof actual !== 'number' || actual <= expected) {
        throw new Error(`Expected number > ${expected} but got ${JSON.stringify(actual)}`)
      }
    },
  }
}

async function run() {
  console.log('Workflow Dry-run Engine Tests\n')

  registerStandardPlugins()

  const workflow: WorkflowConfig = {
    id: 'wf_dry_run_message',
    name: 'dry-run-message',
    trigger: {
      type: 'lark.bitable.record.changed',
      config: {
        app_token: 'app_demo',
        table_id: 'tbl_demo',
      },
    },
    steps: [
      {
        id: 'step_message',
        type: 'action.feishu.message',
        config: {
          receive_id: 'ou_demo',
          receive_id_type: 'open_id',
          content: '{"text":"dry-run message"}',
        },
      },
    ],
  }

  const engine = new WorkflowEngine()
  const context = await engine.execute(
    workflow,
    {
      traceId: 'dry-run-engine-test',
      record: {
        fields: {
          title: 'demo',
        },
        beforeFields: {},
      },
    },
    {
      mode: 'dry-run',
    },
  )

  expect(context.runtime.mode).toBe('dry-run')
  expect(context.steps.step_message.success).toBe(true)
  expect(context.runtime.dryRun.effects.length).toBeGreaterThan(0)
  expect(context.runtime.dryRun.effects[0].action).toBe('feishu.message.create')

  console.log('✓ dry-run 模式下消息动作不会触发真实写操作，且会记录效果预览')
  console.log('\nAll workflow dry-run engine tests passed!')
  process.exit(0)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
