import { ContextManager } from '../../src/workflow/core/context';

const circularOwner: Record<string, unknown> = { name: '循环负责人' };
circularOwner.self = circularOwner;

const mockTrigger = {
  record_id: 'rec123',
  fields: {
    title: 'Test Record',
    status: 'Done',
    count: 10,
    owner: [{ id: 'ou_owner_1' }],
    ownerNamed: [{ id: 'ou_owner_2', name: '张三' }],
    ownerCircular: circularOwner,
  },
};

// Simple test runner since we don't have a dedicated unit test framework for this file
async function runTests() {
  console.log('Running ContextManager tests...');
  const manager = new ContextManager(mockTrigger);
  manager.setStepResult('step1', { success: true, output: { id: 'new_id_456' } });

  // Test 1: Get Value
  const title = manager.getValue('trigger.fields.title');
  console.assert(title === 'Test Record', `Expected "Test Record", got "${title}"`);

  // Test 2: Substitute String
  const str = manager.substitute('Hello ${trigger.fields.title}');
  console.assert(str === 'Hello Test Record', `Expected "Hello Test Record", got "${str}"`);

  // Test 3: Substitute Exact Value (Preserve Type)
  const count = manager.substitute('${trigger.fields.count}');
  console.assert(count === 10, `Expected 10, got ${count}`);

  // Test 4: Substitute Step Output
  const stepId = manager.substitute('${steps.step1.output.id}');
  console.assert(stepId === 'new_id_456', `Expected "new_id_456", got "${stepId}"`);

  // Test 5: Deep Substitution
  const config = {
    url: 'https://api.com/${steps.step1.output.id}',
    body: {
      name: '${trigger.fields.title}',
      meta: {
        source: 'lark',
      },
    },
  };
  const resolved = manager.substituteDeep(config);
  console.assert(resolved.url === 'https://api.com/new_id_456', 'Deep sub URL failed');
  console.assert(resolved.body.name === 'Test Record', 'Deep sub Body failed');

  // Test 6: Interpolate array object values to readable ids
  const ownerReadable = manager.substitute('Owner: ${trigger.fields.owner}');
  console.assert(ownerReadable === 'Owner: ou_owner_1', `Expected "Owner: ou_owner_1", got "${ownerReadable}"`);

  // Test 7: Interpolate named user values with higher readability
  const ownerNamedReadable = manager.substitute('OwnerNamed: ${trigger.fields.ownerNamed}');
  console.assert(ownerNamedReadable === 'OwnerNamed: 张三', `Expected "OwnerNamed: 张三", got "${ownerNamedReadable}"`);

  // Test 8: Avoid [object Object] for complex/circular objects
  const circularReadable = manager.substitute('OwnerCircular: ${trigger.fields.ownerCircular}');
  console.assert(!String(circularReadable).includes('[object Object]'), `Expected no [object Object], got "${circularReadable}"`);
  console.assert(String(circularReadable).includes('循环负责人'), `Expected circular output keep name, got "${circularReadable}"`);

  console.log('ContextManager tests passed!');
}

runTests().catch(console.error);
