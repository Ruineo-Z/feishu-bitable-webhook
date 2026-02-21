import { WorkflowConfig, WorkflowContext, WorkflowRunMode, WorkflowStep, StepResult } from '../types';
import { ContextManager } from './context';
import { PluginRegistry } from './registry';
import { createFeishuLogger } from '../../logger';
import { Condition, ConditionEvaluator, ConditionEvaluatedSource } from '../../engine/condition-evaluator';
import { buildConditionEvaluationContext } from '../condition-context';

interface StepTransitionDecision {
  nextStepId: string | null;
  branchType: 'condition' | 'explicit-next' | 'linear' | 'terminal';
  conditionPass?: boolean;
  skippedStepIds?: string[];
}

interface UnresolvedTemplateRef {
  path: string;
  value: string;
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

function isActionStep(step: WorkflowStep): boolean {
  return step.type.startsWith('action.');
}

function isConditionConfig(value: unknown): value is Condition {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const condition = value as Condition;
  return (
    (condition.logic === 'AND' || condition.logic === 'OR') &&
    Array.isArray(condition.expressions)
  );
}

function evaluateConditionConfig(
  condition: Condition,
  context: WorkflowContext,
): {
  pass: boolean;
  evaluatedSource: ConditionEvaluatedSource;
  typeFallbacks: ReturnType<typeof ConditionEvaluator.collectFieldTypeFallbacks>;
} {
  const evaluationContext = buildConditionEvaluationContext(context);
  const pass = ConditionEvaluator.evaluate(condition, evaluationContext);
  const evaluatedSource = ConditionEvaluator.resolveEvaluatedSource(condition);
  const typeFallbacks = ConditionEvaluator.collectFieldTypeFallbacks(condition, evaluationContext);

  return {
    pass,
    evaluatedSource,
    typeFallbacks,
  };
}

function collectUnresolvedTemplates(
  value: unknown,
  path = '$',
  collector: UnresolvedTemplateRef[] = [],
): UnresolvedTemplateRef[] {
  if (typeof value === 'string') {
    if (/\$\{[^}]+\}/.test(value)) {
      collector.push({
        path,
        value,
      });
    }
    return collector;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      collectUnresolvedTemplates(item, `${path}[${index}]`, collector);
    });
    return collector;
  }

  if (value && typeof value === 'object') {
    Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
      collectUnresolvedTemplates(item, `${path}.${key}`, collector);
    });
  }

  return collector;
}

function withDataMeta(
  result: StepResult,
  dataMeta: Record<string, unknown>,
): StepResult {
  const output = (result.output && typeof result.output === 'object')
    ? { ...(result.output as Record<string, unknown>) }
    : {};

  const existingData = output.data && typeof output.data === 'object'
    ? { ...(output.data as Record<string, unknown>) }
    : {};

  return {
    ...result,
    output: {
      ...output,
      data: {
        ...existingData,
        ...dataMeta,
      },
    },
  };
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
  public async execute(
    workflow: WorkflowConfig,
    triggerContext: any,
    options?: {
      mode?: WorkflowRunMode;
    },
  ): Promise<WorkflowContext> {
    const traceId = triggerContext.traceId || `wf-${Date.now()}`;
    const log = createFeishuLogger(traceId);
    log.info(`开始执行工作流: ${workflow.name} (${workflow.id})`);

    const contextManager = new ContextManager(triggerContext, {
      mode: options?.mode || 'live',
    });
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
        const templatePolicy = step.templatePolicy || 'fail';

        if (step.when !== undefined) {
          if (!isConditionConfig(step.when)) {
            const invalidGuardResult = withTransitionMeta(
              {
                success: false,
                error: '步骤 when 配置不合法',
                output: {
                  code: 'STEP_GUARD_INVALID',
                  durationMs: 0,
                  details: {
                    stepId: step.id,
                    when: step.when,
                  },
                },
              },
              {
                nextStepId: null,
                branchType: 'terminal',
              },
            );

            contextManager.setStepResult(step.id, invalidGuardResult);
            log.error(`步骤 ${step.id} 的 when 配置不合法`, {
              stepId: step.id,
              when: step.when,
            });
            break;
          }

          const guardResult = evaluateConditionConfig(step.when, contextManager.getContext());
          if (guardResult.typeFallbacks.length > 0) {
            log.warn(`步骤 ${step.id} 的 when 条件存在字段类型回退`, {
              stepId: step.id,
              fallbackCount: guardResult.typeFallbacks.length,
              fallbacks: guardResult.typeFallbacks,
            });
          }
          if (!guardResult.pass) {
            const skipTransition = decideNextStep(
              steps,
              step,
              stepIndexMap,
              {
                success: true,
                output: {
                  data: {
                    pass: false,
                  },
                },
              },
              graphMode,
            );

            const skippedResult = withTransitionMeta(
              withDataMeta(
                {
                  success: true,
                  skipped: true,
                  output: {
                    code: 'STEP_SKIPPED',
                    durationMs: 0,
                    data: {},
                  },
                },
                {
                  skip_reason: 'when_condition_not_met',
                  evaluated_source: guardResult.evaluatedSource,
                  template_policy: templatePolicy,
                },
              ),
              skipTransition,
            );

            contextManager.setStepResult(step.id, skippedResult);
            log.info(`步骤 ${step.id} 已跳过（when 条件不满足）`, {
              stepId: step.id,
              skip_reason: 'when_condition_not_met',
              evaluated_source: guardResult.evaluatedSource,
              template_policy: templatePolicy,
              nextStepId: skipTransition.nextStepId,
            });
            currentStepId = skipTransition.nextStepId;
            continue;
          }
        }

        const plugin = this.registry.get(step.type);
        if (!plugin) {
          throw new Error(`未找到插件类型: ${step.type}`);
        }

        const resolvedConfig = contextManager.substituteDeep(step.config);
        if (isActionStep(step)) {
          const unresolvedTemplates = collectUnresolvedTemplates(resolvedConfig, '$.config');
          if (unresolvedTemplates.length > 0) {
            if (templatePolicy === 'skip') {
              const skipTransition = decideNextStep(
                steps,
                step,
                stepIndexMap,
                {
                  success: true,
                  output: {
                    data: {
                      pass: false,
                    },
                  },
                },
                graphMode,
              );

              const skippedResult = withTransitionMeta(
                withDataMeta(
                  {
                    success: true,
                    skipped: true,
                    output: {
                      code: 'STEP_SKIPPED',
                      durationMs: 0,
                      data: {},
                      details: {
                        unresolved_templates: unresolvedTemplates,
                      },
                    },
                  },
                  {
                    skip_reason: 'unresolved_template',
                    template_policy: templatePolicy,
                    unresolved_templates: unresolvedTemplates,
                  },
                ),
                skipTransition,
              );

              contextManager.setStepResult(step.id, skippedResult);
              log.warn(`步骤 ${step.id} 命中未解析模板，按策略跳过`, {
                stepId: step.id,
                template_policy: templatePolicy,
                skip_reason: 'unresolved_template',
                unresolved_templates: unresolvedTemplates,
                nextStepId: skipTransition.nextStepId,
              });
              currentStepId = skipTransition.nextStepId;
              continue;
            }

            const failedResult: StepResult = {
              success: false,
              error: '存在未解析模板变量',
              output: {
                code: 'UNRESOLVED_TEMPLATE',
                durationMs: 0,
                details: {
                  unresolved_templates: unresolvedTemplates,
                  template_policy: templatePolicy,
                },
                data: {
                  template_policy: templatePolicy,
                  unresolved_templates: unresolvedTemplates,
                },
              },
            };

            contextManager.setStepResult(step.id, failedResult);
            log.error(`步骤 ${step.id} 命中未解析模板，按策略失败`, {
              stepId: step.id,
              template_policy: templatePolicy,
              unresolved_templates: unresolvedTemplates,
            });
            break;
          }
        }

        contextManager.setCurrentStep(step.id, step.type);
        const startTime = Date.now();
        let result: StepResult;

        try {
          result = await plugin.execute(contextManager.getContext(), resolvedConfig);
        } finally {
          contextManager.clearCurrentStep();
        }

        const duration = Date.now() - startTime;

        if (isActionStep(step)) {
          result = withDataMeta(result, {
            template_policy: templatePolicy,
          });
        }

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

        log.error(`步骤 ${step.id} 执行失败: ${normalizedResult.error}`, {
          stepId: step.id,
          stepType: step.type,
          output: normalizedResult.output,
        });
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
