import { IWorkflowPlugin, WorkflowContext, StepResult } from '../types';
import { ConditionEvaluator, EvaluationContext } from '../../engine/condition-evaluator';

export class ConditionPlugin implements IWorkflowPlugin {
  async execute(context: WorkflowContext, config: Record<string, unknown>): Promise<StepResult> {
    // 1. Map WorkflowContext to EvaluationContext
    // context.trigger is expected to hold the event data.
    // We need to robustly handle missing data.
    const trigger = context.trigger || {};
    const record = trigger.record || {};

    const evalContext: EvaluationContext = {
      fields: record.fields || {},
      recordId: trigger.record_id || '',
      action: trigger.action_list?.[0]?.action || 'unknown',
      operatorOpenId: trigger.operator_id?.open_id,
      beforeFields: record.beforeFields || {},
      // Field types are ideally passed in context or looked up.
      // For now we leave empty, ConditionEvaluator defaults to 'text' handling.
      fieldTypes: {}
    };

    // 2. Parse condition from config
    // Config structure: { logic: 'AND' | 'OR', expressions: [...] }
    const condition = config as any;

    // 3. Evaluate
    // ConditionEvaluator is synchronous
    let pass = false;
    try {
        pass = ConditionEvaluator.evaluate(condition, evalContext);
    } catch (e: any) {
        return {
            success: false,
            error: `Condition evaluation error: ${e.message}`
        };
    }

    if (pass) {
      return { success: true, output: { pass: true } };
    } else {
      // By returning success: false, we stop the workflow execution in the current Engine implementation.
      return {
        success: false,
        error: 'Condition not met', // This serves as a "stop" signal
        output: { pass: false }
      };
    }
  }
}
