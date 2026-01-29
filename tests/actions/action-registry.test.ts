import { ActionRegistry, executeAction, type ActionResult, type ActionHandler } from '../../src/actions/registry.ts'

const handlers = new Map<string, ActionHandler>()

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
      if (actual !== true) {
        throw new Error(`Expected true but got ${JSON.stringify(actual)}`)
      }
    },
    toBeFalse() {
      if (actual !== false) {
        throw new Error(`Expected false but got ${JSON.stringify(actual)}`)
      }
    },
    toBeUndefined() {
      if (actual !== undefined) {
        throw new Error(`Expected undefined but got ${JSON.stringify(actual)}`)
      }
    },
    toContain(expected: string) {
      if (!String(actual).includes(expected)) {
        throw new Error(`Expected to contain "${expected}" but got ${JSON.stringify(actual)}`)
      }
    },
  }
}

console.log('ActionRegistry Tests\n')

test('has should return false for unregistered action', () => {
  handlers.clear()
  expect(ActionRegistry.has('test_action')).toBeFalse()
})

test('register should add action handler', () => {
  handlers.clear()
  const handler: ActionHandler = {
    execute: async () => ({ success: true, durationMs: 0 })
  }
  ActionRegistry.register('test_action', handler)
  expect(ActionRegistry.has('test_action')).toBeTrue()
})

test('get should return registered handler', () => {
  handlers.clear()
  const handler: ActionHandler = {
    execute: async () => ({ success: true, durationMs: 0 })
  }
  ActionRegistry.register('my_action', handler)
  const retrieved = ActionRegistry.get('my_action')
  expect(retrieved).toBe(handler)
})

test('get should return undefined for unregistered action', () => {
  handlers.clear()
  const retrieved = ActionRegistry.get('unregistered')
  expect(retrieved).toBeUndefined()
})

test('executeAction should return error for unregistered action', async () => {
  handlers.clear()
  const result = await executeAction({ type: 'unknown', params: {} }, {})
  expect(result.success).toBeFalse()
  expect(result.error).toContain('Unknown action type')
})

test('executeAction should execute registered action', async () => {
  handlers.clear()
  const handler: ActionHandler = {
    execute: async (params, context) => ({
      success: true,
      response: { params, context },
      durationMs: 0
    })
  }
  ActionRegistry.register('test_action', handler)
  const params = { key: 'value' }
  const context = { recordId: '123' }
  const result = await executeAction({ type: 'test_action', params }, context)
  expect(result.success).toBeTrue()
  expect(result.response?.params).toBe(params)
  expect(result.response?.context).toBe(context)
})

test('executeAction should propagate errors from handler', async () => {
  handlers.clear()
  const error = new Error('Action failed')
  const handler: ActionHandler = {
    execute: async () => { throw error }
  }
  ActionRegistry.register('failing_action', handler)
  const result = await executeAction({ type: 'failing_action', params: {} }, {})
  expect(result.success).toBeFalse()
  expect(result.error).toBe('Action failed')
})

console.log('\nAll tests passed!')
