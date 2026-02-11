import { ConditionPlugin } from '../../src/workflow/plugins/condition';
import { WorkflowContext } from '../../src/workflow/types';

const plugin = new ConditionPlugin();

async function testCondition(
  name: string,
  config: any,
  contextData: any,
  expectedPass: boolean,
  beforeData: any = {},
) {
  const context: WorkflowContext = {
    trigger: {
      record_id: 'rec1',
      record: {
        fields: contextData,
        beforeFields: beforeData,
      },
      action_list: [{ action: 'update' }]
    },
    steps: {}
  };

  const result = await plugin.execute(context, config);

  // condition plugin returns success: true, output: { pass: true/false }
  // OR success: false (if failed) which means pass: false in engine logic

  const passValue = (result.output as any)?.data?.pass ?? (result.output as any)?.pass;
  const passed = result.success && passValue === true;

  if (passed === expectedPass) {
    console.log(`✅ ${name}`);
  } else {
    console.error(`❌ ${name} - Expected ${expectedPass}, got ${passed}`);
    console.error('Config:', JSON.stringify(config));
    console.error('Data:', JSON.stringify(contextData));
    console.error('Result:', result);
  }
}

async function runTests() {
  console.log('Running Condition Plugin Tests...');

  // 1. Text Equals
  await testCondition('Text Equals (True)',
    { logic: 'AND', expressions: [{ field: 'status', operator: 'equals', value: 'Done' }] },
    { status: 'Done' },
    true
  );

  await testCondition('Text Equals (False)',
    { logic: 'AND', expressions: [{ field: 'status', operator: 'equals', value: 'Done' }] },
    { status: 'InProgress' },
    false
  );

  // 2. Number Comparison
  await testCondition('Number > (True)',
    { logic: 'AND', expressions: [{ field: 'count', operator: '>', value: 10 }] },
    { count: 15 },
    true
  );

  await testCondition('Number > (False)',
    { logic: 'AND', expressions: [{ field: 'count', operator: '>', value: 10 }] },
    { count: 5 },
    false
  );

  // 3. Logic AND
  await testCondition('Logic AND (True)',
    {
      logic: 'AND',
      expressions: [
        { field: 'status', operator: 'equals', value: 'Done' },
        { field: 'count', operator: '>', value: 0 }
      ]
    },
    { status: 'Done', count: 5 },
    true
  );

  await testCondition('Logic AND (False)',
    {
      logic: 'AND',
      expressions: [
        { field: 'status', operator: 'equals', value: 'Done' },
        { field: 'count', operator: '>', value: 0 }
      ]
    },
    { status: 'Done', count: -1 },
    false
  );

  // 4. Logic OR
  await testCondition('Logic OR (True)',
    {
      logic: 'OR',
      expressions: [
        { field: 'status', operator: 'equals', value: 'Done' },
        { field: 'status', operator: 'equals', value: 'Pending' }
      ]
    },
    { status: 'Pending' },
    true
  );

  // 5. Nested / Missing Fields
  await testCondition('Missing Field (False/Not Exists)',
    { logic: 'AND', expressions: [{ field: 'missing_field', operator: 'exists', value: null }] },
    { other: 'value' },
    false // exists check should return false
  );

  await testCondition('Missing Field (True/Not Exists)',
    { logic: 'AND', expressions: [{ field: 'missing_field', operator: 'not_exists', value: null }] },
    { other: 'value' },
    true
  );

  // 6. Contains
  await testCondition('Text Contains (True)',
    { logic: 'AND', expressions: [{ field: 'desc', operator: 'contains', value: 'urgent' }] },
    { desc: 'This is an urgent task' },
    true
  );

  // 7. source-aware 条件
  await testCondition('Source Before Exists (True)',
    { logic: 'AND', expressions: [{ field: '账号第一负责人', operator: 'exists', source: 'before' }] },
    { 账号第一负责人: [] },
    true,
    { 账号第一负责人: [{ id: 'ou_xxx' }] },
  );

  await testCondition('Source Before Exists (False when empty)',
    { logic: 'AND', expressions: [{ field: '账号第一负责人', operator: 'exists', source: 'before' }] },
    { 账号第一负责人: [{ id: 'ou_after' }] },
    false,
    { 账号第一负责人: [] },
  );

  await testCondition('Source Default After (Backward Compatible)',
    { logic: 'AND', expressions: [{ field: '账号当前昵称', operator: 'equals', value: '新昵称' }] },
    { 账号当前昵称: '新昵称' },
    true,
    { 账号当前昵称: '旧昵称' },
  );

  console.log('Tests finished.');
}

runTests().catch(console.error);
