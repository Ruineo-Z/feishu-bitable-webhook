import { IWorkflowPlugin, WorkflowContext, StepResult } from '../types'
import { ConditionEvaluator } from '../../engine/condition-evaluator'
import { okStep, errStep } from './step-result'
import { buildConditionEvaluationContext } from '../condition-context'
import { createLoggerWithTrace } from '../../logger'

export class ConditionPlugin implements IWorkflowPlugin {
  async execute(context: WorkflowContext, config: Record<string, unknown>): Promise<StepResult> {
    const startTime = Date.now()
    const logger = createLoggerWithTrace(context.trigger?.traceId || 'WF-CONDITION', 'condition.ts')
    const evalContext = buildConditionEvaluationContext(context)

    const condition = config as any

    try {
      const pass = ConditionEvaluator.evaluate(condition, evalContext)
      const evaluatedSource = ConditionEvaluator.resolveEvaluatedSource(condition)
      const typeFallbacks = ConditionEvaluator.collectFieldTypeFallbacks(condition, evalContext)
      if (typeFallbacks.length > 0) {
        logger.warn('condition 字段类型缺失或未识别，已回退文本处理', {
          fallbackCount: typeFallbacks.length,
          fallbacks: typeFallbacks,
        })
      }
      return okStep(
        {
          pass,
          evaluated_source: evaluatedSource,
          type_fallbacks: typeFallbacks,
        },
        Date.now() - startTime,
      )
    } catch (error: any) {
      return errStep(
        'CONDITION_EVALUATION_ERROR',
        `Condition evaluation error: ${error.message || error}`,
        Date.now() - startTime,
      )
    }
  }
}
