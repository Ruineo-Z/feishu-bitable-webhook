import { IWorkflowPlugin, WorkflowContext, StepResult } from '../types'
import { ConditionEvaluator, EvaluationContext } from '../../engine/condition-evaluator'
import { okStep, errStep } from './step-result'

export class ConditionPlugin implements IWorkflowPlugin {
  async execute(context: WorkflowContext, config: Record<string, unknown>): Promise<StepResult> {
    const startTime = Date.now()

    const trigger = context.trigger || {}
    const record = trigger.record || {}

    const evalContext: EvaluationContext = {
      fields: record.fields || {},
      recordId: trigger.record_id || '',
      action: trigger.action_list?.[0]?.action || 'unknown',
      operatorOpenId: trigger.operator_id?.open_id,
      beforeFields: record.beforeFields || {},
      fieldTypes: {},
    }

    const condition = config as any

    try {
      const pass = ConditionEvaluator.evaluate(condition, evalContext)
      if (pass) {
        return okStep({ pass: true }, Date.now() - startTime)
      }

      return errStep(
        'CONDITION_NOT_MET',
        'Condition not met',
        Date.now() - startTime,
        { pass: false },
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
