import { validateWorkflowCandidate } from '../../src/workflow/authoring'
import { PluginRegistry } from '../../src/workflow/core/registry'
import { IWorkflowPlugin, StepResult, WorkflowConfig, WorkflowContext } from '../../src/workflow/types'

function expect(actual: unknown) {
  return {
    toBe(expected: unknown) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`)
      }
    },
    toBeTruthy() {
      if (!actual) {
        throw new Error(`Expected value to be truthy but got ${JSON.stringify(actual)}`)
      }
    },
    toHaveLength(expected: number) {
      if (!Array.isArray(actual) || actual.length !== expected) {
        throw new Error(`Expected length ${expected} but got ${JSON.stringify(actual)}`)
      }
    },
    toContain(expected: string) {
      if (!String(actual).includes(expected)) {
        throw new Error(`Expected ${JSON.stringify(actual)} to contain ${expected}`)
      }
    },
  }
}

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn()
    console.log(`✓ ${name}`)
  } catch (error) {
    console.log(`✗ ${name}`)
    console.error(error)
    process.exit(1)
  }
}

class NoopPlugin implements IWorkflowPlugin {
  async execute(_context: WorkflowContext, _config: Record<string, unknown>): Promise<StepResult> {
    return {
      success: true,
      output: {
        code: 'OK',
        durationMs: 0,
      },
    }
  }
}

function createWorkflowConfig(stepType: string): WorkflowConfig {
  return {
    id: 'wf_authoring_test',
    name: 'authoring-test',
    trigger: {
      type: 'lark.bitable.record.changed',
      config: {
        app_token: 'app_demo',
        table_id: 'tbl_demo',
      },
    },
    steps: [
      {
        id: 'step_1',
        type: stepType,
        config: {},
      },
    ],
  }
}

async function run() {
  console.log('Workflow Authoring Loop Tests\n')

  await test('未注册插件时返回结构化错误', async () => {
    const result = await validateWorkflowCandidate({
      operation: 'create',
      name: 'missing-plugin',
      config: createWorkflowConfig('test.missing.plugin'),
      scope: {
        type: 'table',
        appToken: 'app_demo',
        tableId: 'tbl_demo',
      },
      dryRun: false,
    })

    expect(result.valid).toBe(false)
    expect(result.issues.length > 0).toBe(true)
    expect(result.issues[0].code).toBe('PLUGIN_NOT_REGISTERED')
    expect(result.issues[0].path).toContain('$.config.steps')
  })

  await test('校验通过时返回 normalized 与 dry-run 结果', async () => {
    const registry = PluginRegistry.getInstance()
    registry.register('test.authoring.noop', new NoopPlugin())

    const result = await validateWorkflowCandidate({
      operation: 'create',
      name: 'authoring-valid',
      config: createWorkflowConfig('test.authoring.noop'),
      scope: {
        type: 'table',
        appToken: 'app_demo',
        tableId: 'tbl_demo',
      },
      dryRun: true,
    })

    expect(result.valid).toBe(true)
    expect(result.issues).toHaveLength(0)
    expect(result.normalized).toBeTruthy()
    expect(result.dryRun?.status).toBe('success')
    expect(result.dryRun?.executionPath).toHaveLength(1)
  })

  console.log('\nAll workflow authoring loop tests passed!')
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
