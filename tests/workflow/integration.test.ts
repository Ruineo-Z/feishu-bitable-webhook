import { WorkflowEngine } from '../../src/workflow/core/engine';
import { registerStandardPlugins } from '../../src/workflow/plugins';
import { WorkflowConfig } from '../../src/workflow/types';

// Mock dependencies (simple override for this test script)
registerStandardPlugins();

const mockWorkflow: WorkflowConfig = {
  id: 'wf_test_1',
  name: 'Integration Test Workflow',
  trigger: {
    type: 'lark.bitable.record.changed',
    config: { app_token: 'app123', table_id: 'tbl123' }
  },
  steps: [
    {
      id: 'step_1',
      type: 'condition',
      config: {
        logic: 'AND',
        expressions: [
          { field: 'title', operator: 'equals', value: 'Hello' }
        ]
      }
    },
    {
      id: 'step_2',
      type: 'action.feishu.message',
      config: {
        receive_id: 'user_1',
        content: 'Workflow triggered by ${trigger.record.fields.title}'
      },
      next: undefined
    }
  ]
};

const mockTriggerContext = {
  record_id: 'rec_abc',
  app_token: 'app123',
  table_id: 'tbl123',
  record: {
    fields: {
      title: 'Hello',
      status: 'New'
    }
  },
  traceId: 'test-trace-id'
};

async function runTest() {
  console.log('Starting Workflow Engine Integration Test...');

  const engine = new WorkflowEngine();

  // We can't easily mock the internal plugin execution without dependency injection or module mocking
  // But we can check the result context.

  // Note: The FeishuMessagePlugin will likely fail because we don't have real credentials/network here.
  // But that's expected. We just want to see the flow execution.

  const resultContext = await engine.execute(mockWorkflow, mockTriggerContext);

  console.log('Execution finished.');

  // Verify Step 1 (Condition)
  const step1Result = resultContext.steps['step_1'];
  if (step1Result && step1Result.success && step1Result.output.pass === true) {
      console.log('✅ Step 1 (Condition) Passed');
  } else {
      console.error('❌ Step 1 Failed:', step1Result);
  }

  // Verify Step 2 (Action)
  const step2Result = resultContext.steps['step_2'];
  // We expect failure due to missing API creds/mock, but checking if it *ran* is enough
  if (step2Result) {
      console.log('✅ Step 2 Executed (Result exists)');
      if (step2Result.success) {
          console.log('   Step 2 Success');
      } else {
          console.log(`   Step 2 Failed as expected (No real API): ${step2Result.error}`);
          // Confirm it failed for the right reason (API call)
          if (step2Result.error?.includes('Failed to send Feishu message')) {
              console.log('   ✅ Error message matches expected API failure');
          }
      }
  } else {
      console.error('❌ Step 2 did not execute');
  }
}

runTest().catch(console.error);
