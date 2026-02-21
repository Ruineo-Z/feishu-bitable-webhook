import { buildConditionEvaluationContext } from '../../src/workflow/condition-context'
import { WorkflowContext } from '../../src/workflow/types'

function expect(actual: unknown) {
  return {
    toBe(expected: unknown) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`)
      }
    },
    toEqual(expected: unknown) {
      const actualJson = JSON.stringify(actual)
      const expectedJson = JSON.stringify(expected)
      if (actualJson !== expectedJson) {
        throw new Error(`Expected ${expectedJson} but got ${actualJson}`)
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

function buildBaseContext(trigger: Record<string, unknown>): WorkflowContext {
  return {
    trigger,
    steps: {},
    runtime: {
      mode: 'dry-run',
      dryRun: {
        effects: [],
      },
    },
  }
}

async function run() {
  console.log('Condition Context Builder Tests\n')

  await test('should carry fieldTypesByName from trigger record', () => {
    const context = buildBaseContext({
      record_id: 'rec_1',
      action_list: [{ action: 'record_edited' }],
      record: {
        fields: { 标签: ['紧急'] },
        beforeFields: {},
        fieldTypesByName: {
          标签: 'multi_select',
        },
      },
    })

    const evalContext = buildConditionEvaluationContext(context)
    expect(evalContext.fieldTypes?.标签).toBe('multi_select')
  })

  await test('should derive field type by field name from fieldTypesById + fieldIdToName', () => {
    const context = buildBaseContext({
      record_id: 'rec_2',
      action_list: [{ action: 'record_edited' }],
      record: {
        fields: { 第一负责人: [{ id: 'ou_xxx' }] },
        beforeFields: {},
        fieldTypesById: {
          fldOwner: '11',
        },
        fieldIdToName: {
          fldOwner: '第一负责人',
        },
      },
    })

    const evalContext = buildConditionEvaluationContext(context)
    expect(evalContext.fieldTypes?.第一负责人).toBe('11')
    expect(evalContext.fieldTypes?.fldOwner).toBe('11')
  })

  await test('should keep source snapshots and action metadata', () => {
    const context = buildBaseContext({
      record_id: 'rec_3',
      operator_id: { open_id: 'ou_operator' },
      action_list: [{ action: 'record_added' }],
      record: {
        fields: { 分数: 95 },
        beforeFields: { 分数: 80 },
      },
    })

    const evalContext = buildConditionEvaluationContext(context)
    expect(evalContext.recordId).toBe('rec_3')
    expect(evalContext.action).toBe('record_added')
    expect(evalContext.operatorOpenId).toBe('ou_operator')
    expect(evalContext.fields).toEqual({ 分数: 95 })
    expect(evalContext.beforeFields).toEqual({ 分数: 80 })
  })

  console.log('\nAll condition context builder tests passed!')
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
