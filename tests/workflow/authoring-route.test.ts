import { OpenAPIHono } from '@hono/zod-openapi'
import registerWorkflowAuthoringRoutes from '../../src/routes/workflow-authoring'
import { PluginRegistry } from '../../src/workflow/core/registry'
import { IWorkflowPlugin, StepResult, WorkflowContext } from '../../src/workflow/types'

function expect(actual: unknown) {
  return {
    toBe(expected: unknown) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`)
      }
    },
    toBeGreaterThan(expected: number) {
      if (typeof actual !== 'number' || actual <= expected) {
        throw new Error(`Expected ${JSON.stringify(actual)} > ${expected}`)
      }
    },
    toBeUndefined() {
      if (actual !== undefined) {
        throw new Error(`Expected undefined but got ${JSON.stringify(actual)}`)
      }
    },
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

async function run() {
  console.log('Workflow Authoring Route Tests\n')

  const app = new OpenAPIHono()
  registerWorkflowAuthoringRoutes(app)

  const validateRes = await app.request('http://localhost/api/workflows/dry-run', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      operation: 'create',
      name: 'route-test-missing-plugin',
      scope: {
        type: 'table',
        appToken: 'app_demo',
        tableId: 'tbl_demo',
      },
      config: {
        id: 'wf_route_test_missing_plugin',
        name: 'route-test-missing-plugin',
        trigger: {
          type: 'lark.bitable.record.changed',
          config: {
            app_token: 'app_demo',
            table_id: 'tbl_demo',
          },
        },
        steps: [
          {
            id: 'step_missing',
            type: 'test.route.missing_plugin',
            config: {},
          },
        ],
      },
      dryRun: true,
    }),
  })

  expect(validateRes.status).toBe(200)
  const validateBody = await validateRes.json() as any
  expect(validateBody.data.valid).toBe(false)
  expect(validateBody.data.errors.length).toBeGreaterThan(0)
  expect(validateBody.data.errors[0].code).toBe('PLUGIN_NOT_REGISTERED')
  console.log('✓ dry-run 接口返回结构化错误')

  const registry = PluginRegistry.getInstance()
  registry.register('test.route.noop', new NoopPlugin())

  const successRes = await app.request('http://localhost/api/workflows/dry-run', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      operation: 'create',
      name: 'route-test-success',
      scope: {
        type: 'table',
        appToken: 'app_demo',
        tableId: 'tbl_demo',
      },
      config: {
        id: 'wf_route_test_success',
        name: 'route-test-success',
        trigger: {
          type: 'lark.bitable.record.changed',
          config: {
            app_token: 'app_demo',
            table_id: 'tbl_demo',
          },
        },
        steps: [
          {
            id: 'step_noop',
            type: 'test.route.noop',
            config: {},
          },
        ],
      },
      dryRun: true,
    }),
  })

  expect(successRes.status).toBe(200)
  const successBody = await successRes.json() as any
  expect(successBody.data.valid).toBe(true)
  expect(successBody.data.confirmation).toBeUndefined()
  console.log('✓ dry-run 接口仅返回校验与预览，不包含发布令牌')

  console.log('\nAll workflow authoring route tests passed!')
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
