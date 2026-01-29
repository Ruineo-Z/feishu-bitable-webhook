import { ConditionEvaluator, type EvaluationContext } from '../../src/engine/condition-evaluator.ts'

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
    toBeDefined() {
      if (actual === undefined) {
        throw new Error('Expected value to be defined')
      }
    },
    toBeUndefined() {
      if (actual !== undefined) {
        throw new Error(`Expected undefined but got ${JSON.stringify(actual)}`)
      }
    },
    toHaveLength(len: number) {
      if (!Array.isArray(actual) || actual.length !== len) {
        throw new Error(`Expected length ${len} but got ${Array.isArray(actual) ? actual.length : 'not an array'}`)
      }
    },
  }
}

console.log('ConditionEvaluator Tests\n')

const baseContext: EvaluationContext = {
  fields: {},
  recordId: 'test-record-id',
  action: 'record_edited',
  operatorOpenId: 'ou_123',
}

test('equals should compare string values', () => {
  const condition = ConditionEvaluator.parse(JSON.stringify({
    logic: 'AND',
    expressions: [{ field: 'status', operator: 'equals', value: 'active' }]
  }))
  const context = { ...baseContext, fields: { status: 'active' } }
  expect(ConditionEvaluator.evaluate(condition, context)).toBe(true)

  const context2 = { ...baseContext, fields: { status: 'inactive' } }
  expect(ConditionEvaluator.evaluate(condition, context2)).toBe(false)
})

test('not_equals should compare string values', () => {
  const condition = ConditionEvaluator.parse(JSON.stringify({
    logic: 'AND',
    expressions: [{ field: 'status', operator: 'not_equals', value: 'deleted' }]
  }))
  const context = { ...baseContext, fields: { status: 'active' } }
  expect(ConditionEvaluator.evaluate(condition, context)).toBe(true)
})

test('contains should check substring', () => {
  const condition = ConditionEvaluator.parse(JSON.stringify({
    logic: 'AND',
    expressions: [{ field: 'name', operator: 'contains', value: 'test' }]
  }))
  const context = { ...baseContext, fields: { name: 'this is a test string' } }
  expect(ConditionEvaluator.evaluate(condition, context)).toBe(true)

  const context2 = { ...baseContext, fields: { name: 'no match here' } }
  expect(ConditionEvaluator.evaluate(condition, context2)).toBe(false)
})

test('greater_than should compare numbers', () => {
  const condition = ConditionEvaluator.parse(JSON.stringify({
    logic: 'AND',
    expressions: [{ field: 'count', operator: '>', value: 10 }]
  }))
  const context = { ...baseContext, fields: { count: 15 } }
  expect(ConditionEvaluator.evaluate(condition, context)).toBe(true)

  const context2 = { ...baseContext, fields: { count: 5 } }
  expect(ConditionEvaluator.evaluate(condition, context2)).toBe(false)
})

test('AND logic should return true when all conditions are true', () => {
  const condition = ConditionEvaluator.parse(JSON.stringify({
    logic: 'AND',
    expressions: [
      { field: 'status', operator: 'equals', value: 'active' },
      { field: 'count', operator: '>', value: 10 }
    ]
  }))
  const context = { ...baseContext, fields: { status: 'active', count: 15 } }
  expect(ConditionEvaluator.evaluate(condition, context)).toBe(true)
})

test('AND logic should return false when any condition is false', () => {
  const condition = ConditionEvaluator.parse(JSON.stringify({
    logic: 'AND',
    expressions: [
      { field: 'status', operator: 'equals', value: 'active' },
      { field: 'count', operator: '>', value: 100 }
    ]
  }))
  const context = { ...baseContext, fields: { status: 'active', count: 50 } }
  expect(ConditionEvaluator.evaluate(condition, context)).toBe(false)
})

test('OR logic should return true when any condition is true', () => {
  const condition = ConditionEvaluator.parse(JSON.stringify({
    logic: 'OR',
    expressions: [
      { field: 'status', operator: 'equals', value: 'inactive' },
      { field: 'count', operator: '>', value: 100 }
    ]
  }))
  const context = { ...baseContext, fields: { status: 'active', count: 150 } }
  expect(ConditionEvaluator.evaluate(condition, context)).toBe(true)
})

test('OR logic should return false when all conditions are false', () => {
  const condition = ConditionEvaluator.parse(JSON.stringify({
    logic: 'OR',
    expressions: [
      { field: 'status', operator: 'equals', value: 'inactive' },
      { field: 'count', operator: '>', value: 100 }
    ]
  }))
  const context = { ...baseContext, fields: { status: 'active', count: 50 } }
  expect(ConditionEvaluator.evaluate(condition, context)).toBe(false)
})

test('nested field access with dot notation', () => {
  const condition = ConditionEvaluator.parse(JSON.stringify({
    logic: 'AND',
    expressions: [{ field: 'user.name', operator: 'equals', value: 'John' }]
  }))
  const context = { ...baseContext, fields: { user: { name: 'John' } } }
  expect(ConditionEvaluator.evaluate(condition, context)).toBe(true)
})

test('parse should return undefined for empty string', () => {
  expect(ConditionEvaluator.parse('')).toBeUndefined()
})

test('parse should return undefined for whitespace only', () => {
  expect(ConditionEvaluator.parse('   ')).toBeUndefined()
})

test('parse should parse valid JSON condition', () => {
  const json = JSON.stringify({
    logic: 'AND',
    expressions: [{ field: 'test', operator: 'equals', value: 'value' }]
  })
  const result = ConditionEvaluator.parse(json)
  expect(result).toBeDefined()
  expect(result?.logic).toBe('AND')
  expect(result?.expressions).toHaveLength(1)
})

test('parse should throw for invalid JSON', () => {
  let threw = false
  try {
    ConditionEvaluator.parse('invalid json')
  } catch (e) {
    threw = true
    if ((e as Error).message !== 'Invalid condition JSON') {
      throw e
    }
  }
  if (!threw) throw new Error('Expected to throw')
})

console.log('\nAll tests passed!')
