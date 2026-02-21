import { WorkflowEngine } from '../../src/workflow/core/engine'
import { PluginRegistry } from '../../src/workflow/core/registry'
import { ConditionPlugin } from '../../src/workflow/plugins/condition'
import { WorkflowConfig } from '../../src/workflow/types'

function expect(actual: unknown) {
  return {
    toBe(expected: unknown) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`)
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

function buildWorkflow(): WorkflowConfig {
  return {
    id: 'wf_condition_field_types_integration',
    name: 'Condition FieldTypes Integration',
    trigger: {
      type: 'lark.bitable.record.changed',
      config: {
        app_token: 'app_demo',
        table_id: 'tbl_demo',
        actions: ['record_updated'],
      },
    },
    steps: [
      {
        id: 'c1',
        type: 'condition',
        config: {
          logic: 'AND',
          expressions: [
            { field: '标签', operator: 'in', value: '紧急', source: 'after' },
          ],
        },
      },
    ],
  }
}

async function run() {
  console.log('Condition FieldTypes Integration Tests\n')

  const registry = PluginRegistry.getInstance()
  registry.register('condition', new ConditionPlugin())

  await test('fieldTypesByName 注入后应命中 multiSelect 处理器', async () => {
    const engine = new WorkflowEngine()
    const context = await engine.execute(buildWorkflow(), {
      traceId: 'condition-field-types-by-name',
      record: {
        fields: { 标签: ['普通', '紧急'] },
        beforeFields: { 标签: ['普通'] },
        fieldTypesByName: { 标签: 'multi_select' },
      },
    })

    expect(context.steps.c1.success).toBe(true)
    expect((context.steps.c1.output as any)?.data?.pass).toBe(true)
    expect(Array.isArray((context.steps.c1.output as any)?.data?.type_fallbacks)).toBe(true)
    expect((context.steps.c1.output as any)?.data?.type_fallbacks.length).toBe(0)
  })

  await test('仅注入 fieldTypesById + fieldIdToName 时也应命中 multiSelect 处理器', async () => {
    const engine = new WorkflowEngine()
    const context = await engine.execute(buildWorkflow(), {
      traceId: 'condition-field-types-by-id',
      record: {
        fields: { 标签: ['普通', '紧急'] },
        beforeFields: { 标签: ['普通'] },
        fieldTypesById: { fldTag: '4' },
        fieldIdToName: { fldTag: '标签' },
      },
    })

    expect(context.steps.c1.success).toBe(true)
    expect((context.steps.c1.output as any)?.data?.pass).toBe(true)
    expect((context.steps.c1.output as any)?.data?.type_fallbacks.length).toBe(0)
  })

  console.log('\nAll condition fieldTypes integration tests passed!')
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
