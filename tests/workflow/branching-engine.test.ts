import { WorkflowEngine } from '../../src/workflow/core/engine';
import { PluginRegistry } from '../../src/workflow/core/registry';
import { validateWorkflowConfig } from '../../src/workflow/dsl/schema';
import { IWorkflowPlugin, WorkflowConfig, WorkflowContext, StepResult } from '../../src/workflow/types';
import { ConditionPlugin } from '../../src/workflow/plugins/condition';

function expect(actual: unknown) {
  return {
    toBe(expected: unknown) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
      }
    },
    toEqual(expected: unknown) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
      }
    },
    toContain(expected: string) {
      if (!String(actual).includes(expected)) {
        throw new Error(`Expected to contain "${expected}" but got ${JSON.stringify(actual)}`);
      }
    },
    toBeUndefined() {
      if (actual !== undefined) {
        throw new Error(`Expected undefined but got ${JSON.stringify(actual)}`);
      }
    },
  };
}

async function runTest(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.log(`✗ ${name}`);
    console.error(error);
    process.exit(1);
  }
}

class RecordActionPlugin implements IWorkflowPlugin {
  constructor(private readonly stepName: string) {}

  async execute(_context: WorkflowContext, _config: Record<string, unknown>): Promise<StepResult> {
    return {
      success: true,
      output: {
        code: 'OK',
        durationMs: 0,
        data: {
          stepName: this.stepName,
        },
      },
    };
  }
}

function registerTestPlugins() {
  const registry = PluginRegistry.getInstance();
  registry.register('condition', new ConditionPlugin());
  registry.register('test.true', new RecordActionPlugin('true-path'));
  registry.register('test.false', new RecordActionPlugin('false-path'));
  registry.register('test.middle', new RecordActionPlugin('middle-path'));
  registry.register('test.end', new RecordActionPlugin('end-path'));
}

function buildBranchingWorkflow(): WorkflowConfig {
  return {
    id: 'wf_branching_1',
    name: 'branching-test',
    trigger: {
      type: 'lark.bitable.record.changed',
      config: {
        app_token: 'appA',
        table_id: 'tbl1',
      },
    },
    steps: [
      {
        id: 'step_condition',
        type: 'condition',
        config: {
          logic: 'AND',
          expressions: [{ field: 'status', operator: 'equals', value: 'done' }],
        },
        onTrue: 'step_true',
        onFalse: 'step_false',
      },
      {
        id: 'step_true',
        type: 'test.true',
        config: {},
      },
      {
        id: 'step_false',
        type: 'test.false',
        config: {},
      },
    ],
  };
}

function buildMixedWorkflow(): WorkflowConfig {
  return {
    id: 'wf_mixed_1',
    name: 'mixed-test',
    trigger: {
      type: 'lark.bitable.record.changed',
      config: {
        app_token: 'appA',
        table_id: 'tbl1',
      },
    },
    steps: [
      {
        id: 'step_condition',
        type: 'condition',
        config: {
          logic: 'AND',
          expressions: [{ field: 'score', operator: '>', value: 80 }],
        },
        onTrue: 'step_middle',
        onFalse: 'step_end',
      },
      {
        id: 'step_middle',
        type: 'test.middle',
        config: {},
        next: 'step_end',
      },
      {
        id: 'step_end',
        type: 'test.end',
        config: {},
      },
    ],
  };
}

async function run() {
  console.log('Workflow Branching Engine Tests\n');
  registerTestPlugins();

  await runTest('DSL 校验：拒绝引用不存在的分支节点', () => {
    const source = buildBranchingWorkflow();
    const invalid: WorkflowConfig = {
      ...source,
      steps: [
        {
          ...source.steps[0],
          onTrue: 'missing_step',
          onFalse: 'step_false',
        },
        ...source.steps.slice(1),
      ],
    };

    let threw = false;
    try {
      validateWorkflowConfig(invalid);
    } catch (error: any) {
      threw = true;
      expect(error.message).toContain('不存在的目标节点');
    }

    expect(threw).toBe(true);
  });

  await runTest('DSL 校验：拒绝环路配置', () => {
    const invalid: WorkflowConfig = {
      id: 'wf_cycle',
      name: 'cycle-test',
      trigger: {
        type: 'lark.bitable.record.changed',
        config: {
          app_token: 'appA',
          table_id: 'tbl1',
        },
      },
      steps: [
        {
          id: 'step_a',
          type: 'test.middle',
          config: {},
          next: 'step_b',
        },
        {
          id: 'step_b',
          type: 'test.end',
          config: {},
          next: 'step_a',
        },
      ],
    };

    let threw = false;
    try {
      validateWorkflowConfig(invalid);
    } catch (error: any) {
      threw = true;
      expect(error.message).toContain('循环依赖');
    }

    expect(threw).toBe(true);
  });

  await runTest('分支执行：条件命中时走 onTrue', async () => {
    const workflow = buildBranchingWorkflow();
    const engine = new WorkflowEngine();

    const context = await engine.execute(workflow, {
      traceId: 'test-branch-true',
      record: {
        fields: {
          status: 'done',
        },
      },
    });

    expect(context.steps.step_condition.success).toBe(true);
    expect(context.steps.step_true.success).toBe(true);
    expect(context.steps.step_false).toBeUndefined();

    const transition = (context.steps.step_condition.output as any)?.data?.transition;
    expect(transition.nextStepId).toBe('step_true');
    expect(transition.conditionPass).toBe(true);
    expect(transition.skippedStepIds).toEqual(['step_false']);
  });

  await runTest('分支执行：条件未命中时走 onFalse', async () => {
    const workflow = buildBranchingWorkflow();
    const engine = new WorkflowEngine();

    const context = await engine.execute(workflow, {
      traceId: 'test-branch-false',
      record: {
        fields: {
          status: 'todo',
        },
      },
    });

    expect(context.steps.step_condition.success).toBe(true);
    expect(context.steps.step_true).toBeUndefined();
    expect(context.steps.step_false.success).toBe(true);

    const transition = (context.steps.step_condition.output as any)?.data?.transition;
    expect(transition.nextStepId).toBe('step_false');
    expect(transition.conditionPass).toBe(false);
    expect(transition.skippedStepIds).toEqual(['step_true']);
  });

  await runTest('混合执行：分支节点与线性 next 可共同工作', async () => {
    const workflow = buildMixedWorkflow();
    const engine = new WorkflowEngine();

    const context = await engine.execute(workflow, {
      traceId: 'test-mixed-branching',
      record: {
        fields: {
          score: 90,
        },
      },
    });

    expect(context.steps.step_condition.success).toBe(true);
    expect(context.steps.step_middle.success).toBe(true);
    expect(context.steps.step_end.success).toBe(true);

    const middleTransition = (context.steps.step_middle.output as any)?.data?.transition;
    expect(middleTransition.nextStepId).toBe('step_end');
    expect(middleTransition.type).toBe('explicit-next');
  });

  console.log('\nAll workflow branching tests passed!');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
