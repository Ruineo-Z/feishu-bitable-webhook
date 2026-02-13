import { DryRunEffect, WorkflowContext } from '../types'

export function isDryRunContext(context: WorkflowContext): boolean {
  return context.runtime?.mode === 'dry-run'
}

export function appendDryRunEffect(
  context: WorkflowContext,
  effect: Omit<DryRunEffect, 'stepId' | 'stepType'>
    & Partial<Pick<DryRunEffect, 'stepId' | 'stepType'>>,
): void {
  if (!isDryRunContext(context)) {
    return
  }

  const stepId = effect.stepId || context.runtime.currentStepId || 'unknown_step'
  const stepType = effect.stepType || context.runtime.currentStepType || 'unknown_type'

  context.runtime.dryRun.effects.push({
    stepId,
    stepType,
    action: effect.action,
    target: effect.target,
    payload: effect.payload,
  })
}
