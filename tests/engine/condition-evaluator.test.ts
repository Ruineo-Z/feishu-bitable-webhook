import { ConditionEvaluator, type EvaluationContext, FIELD_TYPE_HANDLERS } from '../../src/engine/condition-evaluator.ts'

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

// Base context for tests
const baseContext: EvaluationContext = {
  fields: {},
  recordId: 'test-record-id',
  action: 'record_edited',
  operatorOpenId: 'ou_123',
}

// Text Handler Tests
test('Text Handler - equals', () => {
  const result = FIELD_TYPE_HANDLERS.text.evaluate('hello', 'hello', baseContext)
  expect(result.equals).toBe(true)
  expect(result.not_equals).toBe(false)
})

test('Text Handler - contains', () => {
  const result = FIELD_TYPE_HANDLERS.text.evaluate('hello world', 'world', baseContext)
  expect(result.contains).toBe(true)
  expect(result.not_contains).toBe(false)
})

test('Text Handler - exists', () => {
  const resultExists = FIELD_TYPE_HANDLERS.text.evaluate('text', 'value', baseContext)
  expect(resultExists.exists).toBe(true)
  expect(resultExists.not_exists).toBe(false)

  const resultNotExists = FIELD_TYPE_HANDLERS.text.evaluate('', 'value', baseContext)
  expect(resultNotExists.exists).toBe(false)
  expect(resultNotExists.not_exists).toBe(true)
})

// Number Handler Tests
test('Number Handler - greater than', () => {
  const result = FIELD_TYPE_HANDLERS.number.evaluate(10, 5, baseContext)
  expect(result['>']).toBe(true)
  expect(result['>=']).toBe(true)
  expect(result['<']).toBe(false)
})

test('Number Handler - less than or equal', () => {
  const result = FIELD_TYPE_HANDLERS.number.evaluate(5, 10, baseContext)
  expect(result['<=']).toBe(true)
  expect(result['<']).toBe(true)
})

test('Number Handler - equals', () => {
  const result = FIELD_TYPE_HANDLERS.number.evaluate(100, 100, baseContext)
  expect(result.equals).toBe(true)
  expect(result.not_equals).toBe(false)
})

// MultiSelect Handler Tests
test('MultiSelect Handler - contains', () => {
  const result = FIELD_TYPE_HANDLERS.multiSelect.evaluate(['A', 'B', 'C'], 'B', baseContext)
  expect(result.contains).toBe(true)
  expect(result.not_contains).toBe(false)
  expect(result.exists).toBe(true)
  expect(result.in).toBe(true)
})

test('MultiSelect Handler - not contains', () => {
  const result = FIELD_TYPE_HANDLERS.multiSelect.evaluate(['A', 'B', 'C'], 'D', baseContext)
  expect(result.contains).toBe(false)
  expect(result.not_contains).toBe(true)
})

test('MultiSelect Handler - empty array', () => {
  const result = FIELD_TYPE_HANDLERS.multiSelect.evaluate([], 'A', baseContext)
  expect(result.exists).toBe(false)
  expect(result.not_exists).toBe(true)
})

// User Handler Tests
test('User Handler - contains user', () => {
  const users = [{ id: 'user1' }, { id: 'user2' }]
  const result = FIELD_TYPE_HANDLERS.user.evaluate(users, { id: 'user1' }, baseContext)
  expect(result.contains).toBe(true)
  expect(result.in).toBe(true)
})

test('User Handler - not contains user', () => {
  const users = [{ id: 'user1' }, { id: 'user2' }]
  const result = FIELD_TYPE_HANDLERS.user.evaluate(users, { id: 'user3' }, baseContext)
  expect(result.contains).toBe(false)
})

test('User Handler - empty array', () => {
  const result = FIELD_TYPE_HANDLERS.user.evaluate([], 'user1', baseContext)
  expect(result.exists).toBe(false)
  expect(result.not_exists).toBe(true)
})

// Date Handler Tests
test('Date Handler - between', () => {
  const date = '2024-06-15'
  const range = ['2024-01-01', '2024-12-31']
  const result = FIELD_TYPE_HANDLERS.date.evaluate(date, range, baseContext)
  expect(result.between).toBe(true)
})

test('Date Handler - not between', () => {
  const date = '2024-06-15'
  const range = ['2024-01-01', '2024-03-31']
  const result = FIELD_TYPE_HANDLERS.date.evaluate(date, range, baseContext)
  expect(result.between).toBe(false)
})

test('Date Handler - comparison operators', () => {
  const date1 = '2024-06-15'
  const date2 = '2024-01-01'
  const result = FIELD_TYPE_HANDLERS.date.evaluate(date1, date2, baseContext)
  expect(result['>']).toBe(true)
  expect(result['>=']).toBe(true)
})

// Checkbox Handler Tests
test('Checkbox Handler - equals true', () => {
  const result = FIELD_TYPE_HANDLERS.checkbox.evaluate(true, true, baseContext)
  expect(result.equals).toBe(true)
  expect(result.not_equals).toBe(false)
})

test('Checkbox Handler - equals false', () => {
  const result = FIELD_TYPE_HANDLERS.checkbox.evaluate(false, false, baseContext)
  expect(result.equals).toBe(true)
})

test('Checkbox Handler - not equals', () => {
  const result = FIELD_TYPE_HANDLERS.checkbox.evaluate(true, false, baseContext)
  expect(result.not_equals).toBe(true)
})

// SingleSelect Handler Tests
test('SingleSelect Handler - equals', () => {
  const result = FIELD_TYPE_HANDLERS.singleSelect.evaluate('optionA', 'optionA', baseContext)
  expect(result.equals).toBe(true)
  expect(result.not_equals).toBe(false)
})

test('SingleSelect Handler - not equals', () => {
  const result = FIELD_TYPE_HANDLERS.singleSelect.evaluate('optionA', 'optionB', baseContext)
  expect(result.equals).toBe(false)
  expect(result.not_equals).toBe(true)
})

// Link Handler Tests
test('Link Handler - contains link', () => {
  const links = [{ id: 'link1' }, { id: 'link2' }]
  const result = FIELD_TYPE_HANDLERS.link.evaluate(links, { id: 'link1' }, baseContext)
  expect(result.contains).toBe(true)
})

test('Link Handler - not contains', () => {
  const links = [{ id: 'link1' }, { id: 'link2' }]
  const result = FIELD_TYPE_HANDLERS.link.evaluate(links, { id: 'link3' }, baseContext)
  expect(result.contains).toBe(false)
})

// ==================== Type-Aware Evaluation Tests ====================
console.log('\n--- Type-Aware Evaluation Tests ---\n')

test('should use text handler for text field type', () => {
  const condition = ConditionEvaluator.parse(JSON.stringify({
    logic: 'AND',
    expressions: [{ field: 'name', operator: 'contains', value: 'test' }]
  }))
  const context = {
    ...baseContext,
    fields: { name: 'This is a TEST' },
    fieldTypes: { name: 'text' }
  }
  expect(ConditionEvaluator.evaluate(condition, context)).toBe(true)
})

test('should use number handler for number field type', () => {
  const condition = ConditionEvaluator.parse(JSON.stringify({
    logic: 'AND',
    expressions: [{ field: 'count', operator: '>=', value: 10 }]
  }))
  const context = {
    ...baseContext,
    fields: { count: 15 },
    fieldTypes: { count: 'number' }
  }
  expect(ConditionEvaluator.evaluate(condition, context)).toBe(true)
})

test('should use multiSelect handler for multiSelect field type', () => {
  const condition = ConditionEvaluator.parse(JSON.stringify({
    logic: 'AND',
    expressions: [{ field: 'tags', operator: 'contains', value: 'urgent' }]
  }))
  const context = {
    ...baseContext,
    fields: { tags: ['bug', 'urgent', 'high-priority'] },
    fieldTypes: { tags: 'multiSelect' }
  }
  expect(ConditionEvaluator.evaluate(condition, context)).toBe(true)
})

test('should fall back to text handler for unknown field type', () => {
  const condition = ConditionEvaluator.parse(JSON.stringify({
    logic: 'AND',
    expressions: [{ field: 'unknownField', operator: 'contains', value: 'test' }]
  }))
  const context = {
    ...baseContext,
    fields: { unknownField: 'test value' },
    fieldTypes: { unknownField: 'unknown_type' }
  }
  expect(ConditionEvaluator.evaluate(condition, context)).toBe(true)
})

// ==================== Original ConditionEvaluator Tests ====================
console.log('\n--- Original ConditionEvaluator Tests ---\n')

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
