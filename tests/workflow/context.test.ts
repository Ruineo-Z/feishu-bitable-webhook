import { ContextManager } from '../../src/workflow/core/context';

const mockTrigger = {
  record_id: 'rec123',
  fields: {
    title: 'Test Record',
    status: 'Done',
    count: 10
  }
};

const mockContext = {
    trigger: mockTrigger,
    steps: {
        step1: {
            success: true,
            output: { id: 'new_id_456' }
        }
    }
}

// Simple test runner since we don't have a test framework setup shown in package.json for unit tests besides 'tsup'
// We will just run this file with tsx
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
              source: 'lark'
          }
      }
  };
  const resolved = manager.substituteDeep(config);
  console.assert(resolved.url === 'https://api.com/new_id_456', 'Deep sub URL failed');
  console.assert(resolved.body.name === 'Test Record', 'Deep sub Body failed');

  console.log('ContextManager tests passed!');
}

runTests().catch(console.error);
