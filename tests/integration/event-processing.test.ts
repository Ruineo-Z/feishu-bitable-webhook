import { ConditionEvaluator } from '../../src/engine/condition-evaluator.ts'
import { ActionRegistry, executeAction } from '../../src/actions/registry.ts'

const handlers = new Map()

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`✓ ${name}`)
  } catch (e) {
    console.log(`✗ ${name}`)
    console.error(e)
    process.exit(1)
  }
}

function expect(actual: unknown) {
  return {
    toBe(expected: unknown) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`)
      }
    },
    toBeTrue() {
      if (actual !== true) throw new Error('Expected true')
    },
    toBeFalse() {
      if (actual !== false) throw new Error('Expected false')
    },
    toContain(expected: string) {
      if (!String(actual).includes(expected)) {
        throw new Error(`Expected to contain "${expected}" but got ${JSON.stringify(actual)}`)
      }
    },
    toHaveLength(len: number) {
      if (!Array.isArray(actual) || actual.length !== len) {
        throw new Error(`Expected length ${len} but got ${Array.isArray(actual) ? actual.length : 'not an array'}`)
      }
    },
  }
}

console.log('Integration Tests: Event Processing Flow\n')

let executedActions: Array<{ type: string; params: Record<string, unknown> }> = []

function setupActions() {
  handlers.clear()
  ActionRegistry.register('test_action', {
    execute: async (params: Record<string, unknown>) => {
      executedActions.push({ type: 'test_action', params })
      return { success: true, durationMs: 1 }
    }
  })
  ActionRegistry.register('logging_action', {
    execute: async (params: Record<string, unknown>) => {
      executedActions.push({ type: 'logging_action', params })
      return { success: true, durationMs: 1 }
    }
  })
}

test('完整流程: 事件触发 -> 条件匹配 -> 动作执行', async () => {
  setupActions()
  executedActions = []

  const event = {
    action: 'record_edited' as const,
    tableId: 'table-789',
    recordId: 'record-001',
    operatorOpenId: 'ou_123456',
    fields: {
      status: 'active',
      count: 25,
      name: '测试记录'
    }
  }

  const condition = ConditionEvaluator.parse(JSON.stringify({
    logic: 'AND',
    expressions: [
      { field: 'status', operator: 'equals', value: 'active' },
      { field: 'count', operator: '>', value: 10 }
    ]
  }))

  const context = {
    fields: event.fields,
    recordId: event.recordId,
    action: event.action,
    operatorOpenId: event.operatorOpenId
  }

  const conditionResult = ConditionEvaluator.evaluate(condition, context)
  expect(conditionResult).toBeTrue()

  const actionResult = await executeAction(
    { type: 'test_action', params: { message: `Record ${event.recordId} edited` } },
    context
  )
  expect(actionResult.success).toBeTrue()
  expect(executedActions).toHaveLength(1)
  expect(executedActions[0].type).toBe('test_action')
})

test('条件不匹配时不应执行动作', async () => {
  setupActions()
  executedActions = []

  const event = {
    action: 'record_edited' as const,
    tableId: 'table-789',
    recordId: 'record-002',
    operatorOpenId: 'ou_123456',
    fields: {
      status: 'inactive',
      count: 5,
      name: '另一条记录'
    }
  }

  const condition = ConditionEvaluator.parse(JSON.stringify({
    logic: 'AND',
    expressions: [
      { field: 'status', operator: 'equals', value: 'active' },
      { field: 'count', operator: '>', value: 10 }
    ]
  }))

  const context = {
    fields: event.fields,
    recordId: event.recordId,
    action: event.action,
    operatorOpenId: event.operatorOpenId
  }

  const conditionResult = ConditionEvaluator.evaluate(condition, context)
  expect(conditionResult).toBeFalse()

  expect(executedActions).toHaveLength(0)
})

test('OR 逻辑: 任一条件满足即执行', async () => {
  setupActions()
  executedActions = []

  const event = {
    action: 'record_edited' as const,
    tableId: 'table-789',
    recordId: 'record-003',
    operatorOpenId: 'ou_123456',
    fields: {
      status: 'inactive',
      count: 50,
      name: '第三条记录'
    }
  }

  const condition = ConditionEvaluator.parse(JSON.stringify({
    logic: 'OR',
    expressions: [
      { field: 'status', operator: 'equals', value: 'active' },
      { field: 'count', operator: '>', value: 30 }
    ]
  }))

  const context = {
    fields: event.fields,
    recordId: event.recordId,
    action: event.action,
    operatorOpenId: event.operatorOpenId
  }

  const conditionResult = ConditionEvaluator.evaluate(condition, context)
  expect(conditionResult).toBeTrue()
  expect(executedActions).toHaveLength(0)
})

test('嵌套字段条件匹配', async () => {
  setupActions()
  executedActions = []

  const event = {
    action: 'record_edited' as const,
    tableId: 'table-789',
    recordId: 'record-004',
    operatorOpenId: 'ou_123456',
    fields: {
      user: { name: '张三', department: '技术部' },
      amount: 1500
    }
  }

  const condition = ConditionEvaluator.parse(JSON.stringify({
    logic: 'AND',
    expressions: [
      { field: 'user.name', operator: 'equals', value: '张三' },
      { field: 'amount', operator: '>', value: 1000 }
    ]
  }))

  const context = {
    fields: event.fields,
    recordId: event.recordId,
    action: event.action,
    operatorOpenId: event.operatorOpenId
  }

  const conditionResult = ConditionEvaluator.evaluate(condition, context)
  expect(conditionResult).toBeTrue()
})

test('多动作链式执行', async () => {
  setupActions()
  executedActions = []

  const event = {
    action: 'record_created' as const,
    tableId: 'table-789',
    recordId: 'record-005',
    operatorOpenId: 'ou_789012',
    fields: {
      status: 'new',
      priority: 'high'
    }
  }

  const context = {
    fields: event.fields,
    recordId: event.recordId,
    action: event.action,
    operatorOpenId: event.operatorOpenId
  }

  await executeAction({ type: 'test_action', params: { step: 1 } }, context)
  await executeAction({ type: 'logging_action', params: { step: 2 } }, context)
  await executeAction({ type: 'test_action', params: { step: 3 } }, context)

  expect(executedActions).toHaveLength(3)
  expect(executedActions[0].type).toBe('test_action')
  expect(executedActions[1].type).toBe('logging_action')
  expect(executedActions[2].type).toBe('test_action')
})

console.log('\nAll integration tests passed!')
