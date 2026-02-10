import { WorkflowConfig, WorkflowContext, WorkflowStep, StepResult } from '../types';
import { ContextManager } from './context';
import { PluginRegistry } from './registry';
import { createFeishuLogger } from '../../logger';

interface StepTransitionDecision {
  nextStepId: string | null;
  branchType: 'condition' | 'explicit-next' | 'linear' | 'terminal';
  conditionPass?: boolean;
  skippedStepIds?: string[];
}

function buildStepIndexMap(steps: WorkflowStep[]): Map<string, number> {
  const map = new Map<string, number>();
  steps.forEach((step, index) => {
    map.set(step.id, index);
  });
  return map;
}

function isGraphModeWorkflow(steps: WorkflowStep[]): boolean {
  return steps.some((step) => !!(step.next || step.onTrue || step.onFalse));
}

function readConditionPass(result: StepResult): boolean | null {
  const output = result.output as any;
  const directPass = output?.data?.pass;
  if (typeof directPass === 'boolean') return directPass;

  const detailsPass = output?.details?.pass;
  if (typeof detailsPass === 'boolean') return detailsPass;

  return null;
}

function getLinearNextStepId(steps: WorkflowStep[], currentIndex: number): string | null {
  return steps[currentIndex + 1]?.id || null;
}

function decideNextStep(
  steps: WorkflowStep[],
  step: WorkflowStep,
  stepIndexMap: Map<string, number>,
  result: StepResult,
  graphMode: boolean,
): StepTransitionDecision {
  const currentIndex = stepIndexMap.get(step.id);
  if (currentIndex === undefined) {
    return {
      nextStepId: null,
      branchType: 'terminal',
    };
  }

  const fallbackNextStepId = graphMode ? null : getLinearNextStepId(steps, currentIndex);

  if (step.type === 'condition') {
    const conditionPass = readConditionPass(result);

    if (step.onTrue || step.onFalse) {
      const preferredNext = conditionPass === true ? step.onTrue : step.onFalse;
      const nextStepId = preferredNext || step.next || fallbackNextStepId;
      const skippedStepIds = conditionPass === true
        ? (step.onFalse ? [step.onFalse] : [])
        : (step.onTrue ? [step.onTrue] : []);

      return {
        nextStepId,
        branchType: nextStepId ? 'condition' : 'terminal',
        conditionPass: conditionPass === true,
        skippedStepIds,
      };
    }

    if (step.next) {
      return {
        nextStepId: step.next,
        branchType: 'explicit-next',
        conditionPass: conditionPass === true,
      };
    }

    return {
      nextStepId: fallbackNextStepId,
      branchType: fallbackNextStepId ? 'linear' : 'terminal',
      conditionPass: conditionPass === true,
    };
  }

  if (step.next) {
    return {
      nextStepId: step.next,
      branchType: 'explicit-next',
    };
  }

  return {
    nextStepId: fallbackNextStepId,
    branchType: fallbackNextStepId ? 'linear' : 'terminal',
  };
}

function withTransitionMeta(result: StepResult, transition: StepTransitionDecision): StepResult {
  const output = (result.output && typeof result.output === 'object')
    ? { ...(result.output as Record<string, unknown>) }
    : {};

  const existingData = output.data && typeof output.data === 'object'
    ? { ...(output.data as Record<string, unknown>) }
    : {};

  existingData.transition = {
    type: transition.branchType,
    nextStepId: transition.nextStepId,
    conditionPass: transition.conditionPass,
    skippedStepIds: transition.skippedStepIds || [],
  };

  return {
    ...result,
    output: {
      ...output,
      data: existingData,
    },
  };
}

export class WorkflowEngine {
  private registry: PluginRegistry;
  private logger = createFeishuLogger('WORKFLOW');

  constructor() {
    this.registry = PluginRegistry.getInstance();
  }

  /**
   * Executes a workflow with the given trigger context.
   */
  public async execute(workflow: WorkflowConfig, triggerContext: any): Promise<WorkflowContext> {
    const traceId = triggerContext.traceId || `wf-${Date.now()}`;
    const log = createFeishuLogger(traceId);
    log.info(`开始执行工作流: ${workflow.name} (${workflow.id})`);

    const contextManager = new ContextManager(triggerContext);
    const steps = workflow.steps || [];

    if (steps.length === 0) {
      log.warn(`工作流 ${workflow.id} 未包含可执行步骤`);
      return contextManager.getContext();
    }

    const graphMode = isGraphModeWorkflow(steps);
    const stepIndexMap = buildStepIndexMap(steps);
    const visitedStepIds = new Set<string>();

    let currentStepId: string | null = steps[0].id;

    while (currentStepId) {
      if (visitedStepIds.has(currentStepId)) {
        const cycleError = `检测到循环执行路径，步骤 ${currentStepId} 被重复访问`;
        log.error(cycleError);
        contextManager.setStepResult(currentStepId, {
          success: false,
          error: cycleError,
          output: {
            code: 'WORKFLOW_CYCLE_DETECTED',
            durationMs: 0,
            details: {
              currentStepId,
              visitedStepIds: Array.from(visitedStepIds),
            },
          },
        });
        break;
      }

      visitedStepIds.add(currentStepId);

      const stepIndex = stepIndexMap.get(currentStepId);
      if (stepIndex === undefined) {
        const missingStepError = `工作流节点不存在: ${currentStepId}`;
        log.error(missingStepError);
        contextManager.setStepResult(currentStepId, {
          success: false,
          error: missingStepError,
          output: {
            code: 'WORKFLOW_STEP_NOT_FOUND',
            durationMs: 0,
            details: { currentStepId },
          },
        });
        break;
      }

      const step = steps[stepIndex];
      log.info(`执行步骤: ${step.name || step.id} (${step.type})`);

      try {
        const plugin = this.registry.get(step.type);
        if (!plugin) {
          throw new Error(`未找到插件类型: ${step.type}`);
        }

        const resolvedConfig = contextManager.substituteDeep(step.config);

        const startTime = Date.now();
        const result: StepResult = await plugin.execute(contextManager.getContext(), resolvedConfig);
        const duration = Date.now() - startTime;

        const isConditionStep = step.type === 'condition';
        const conditionPass = isConditionStep ? readConditionPass(result) : null;
        const hasConditionBranch = isConditionStep && !!(step.onTrue || step.onFalse);

        if (isConditionStep && conditionPass === false && !hasConditionBranch) {
          const normalizedResult = withTransitionMeta(
            {
              ...result,
              success: false,
              error: result.error || 'Condition not met',
              output: {
                ...(result.output as Record<string, unknown>),
                code: (result.output as any)?.code || 'CONDITION_NOT_MET',
                data: {
                  ...((result.output as any)?.data || {}),
                  pass: false,
                },
              },
            },
            {
              nextStepId: null,
              branchType: 'terminal',
              conditionPass: false,
              skippedStepIds: [],
            },
          );

          contextManager.setStepResult(step.id, normalizedResult);
          log.warn(`条件步骤 ${step.id} 未命中，按线性语义终止工作流`);
          break;
        }

        const transition = decideNextStep(steps, step, stepIndexMap, result, graphMode);
        const normalizedResult = withTransitionMeta(result, transition);

        contextManager.setStepResult(step.id, normalizedResult);

        if (normalizedResult.success) {
          log.success(`步骤 ${step.id} 执行成功 (${duration}ms)`);
          if (step.type === 'condition') {
            log.info('条件步骤分支决策', {
              stepId: step.id,
              conditionPass: transition.conditionPass,
              nextStepId: transition.nextStepId,
              skippedStepIds: transition.skippedStepIds || [],
            });
          }
          currentStepId = transition.nextStepId;
          continue;
        }

        log.error(`步骤 ${step.id} 执行失败: ${normalizedResult.error}`);
        break;
      } catch (error: any) {
        log.error(`步骤 ${step.id} 执行异常:`, error);
        contextManager.setStepResult(step.id, {
          success: false,
          error: error.message || String(error),
          output: {
            code: 'WORKFLOW_STEP_RUNTIME_ERROR',
            durationMs: 0,
            details: {
              stepId: step.id,
              stepType: step.type,
            },
          },
        });
        break;
      }
    }

    log.info(`工作流 ${workflow.id} 执行结束`);
    return contextManager.getContext();
  }
}
