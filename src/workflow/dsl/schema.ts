import { z } from 'zod';

const WORKFLOW_EVENT_TYPE_ENUM = z.enum(['record_created', 'record_updated', 'record_deleted']);
const WORKFLOW_CONDITION_LOGIC_ENUM = z.enum(['AND', 'OR']);

export const WorkflowConditionSourceSchema = z.enum(['before', 'after']);
export const WorkflowTemplatePolicySchema = z.enum(['fail', 'skip']);

export const WorkflowConditionExpressionSchema = z.object({
  field: z.string().min(1),
  operator: z.string().min(1),
  value: z.unknown().optional(),
  source: WorkflowConditionSourceSchema.optional(),
});

export const WorkflowConditionSchema = z.object({
  logic: WORKFLOW_CONDITION_LOGIC_ENUM,
  expressions: z.array(WorkflowConditionExpressionSchema).min(1),
});

type WorkflowStepLike = {
  id: string;
  type: string;
  next?: string;
  onTrue?: string;
  onFalse?: string;
};

function isConditionStep(step: WorkflowStepLike): boolean {
  return step.type === 'condition';
}

function fallbackNextStepId(steps: WorkflowStepLike[], index: number): string | undefined {
  const nextStep = steps[index + 1];
  return nextStep ? nextStep.id : undefined;
}

function isGraphModeWorkflow(steps: WorkflowStepLike[]): boolean {
  return steps.some((step) => !!(step.next || step.onTrue || step.onFalse));
}

function collectStepTargets(steps: WorkflowStepLike[], index: number, graphMode: boolean): string[] {
  const step = steps[index];
  const fallbackNext = graphMode ? undefined : fallbackNextStepId(steps, index);

  if (isConditionStep(step)) {
    if (step.onTrue || step.onFalse) {
      const targets = [step.onTrue, step.onFalse].filter((item): item is string => !!item);
      return Array.from(new Set(targets));
    }

    if (step.next) {
      return [step.next];
    }

    return fallbackNext ? [fallbackNext] : [];
  }

  if (step.next) {
    return [step.next];
  }

  return fallbackNext ? [fallbackNext] : [];
}

function validateWorkflowGraph(steps: WorkflowStepLike[], ctx: z.RefinementCtx): void {
  const stepIndexMap = new Map<string, number>();

  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    if (stepIndexMap.has(step.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['steps', index, 'id'],
        message: `步骤 ID 重复: ${step.id}`,
      });
      continue;
    }

    stepIndexMap.set(step.id, index);
  }

  const edges = new Map<string, string[]>();
  const graphMode = isGraphModeWorkflow(steps);

  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    const targets = collectStepTargets(steps, index, graphMode);

    edges.set(step.id, targets);

    if (isConditionStep(step)) {
      const hasBranchField = !!step.onTrue || !!step.onFalse;
      if (hasBranchField && (!step.onTrue || !step.onFalse)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['steps', index],
          message: 'condition 步骤开启分支时必须同时提供 onTrue 和 onFalse',
        });
      }
    }

    for (const target of targets) {
      if (!stepIndexMap.has(target)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['steps', index],
          message: `步骤 ${step.id} 引用了不存在的目标节点: ${target}`,
        });
      }
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();

  function dfs(stepId: string): boolean {
    if (visiting.has(stepId)) {
      return true;
    }

    if (visited.has(stepId)) {
      return false;
    }

    visiting.add(stepId);

    const targets = edges.get(stepId) || [];
    for (const target of targets) {
      if (!stepIndexMap.has(target)) {
        continue;
      }

      if (dfs(target)) {
        return true;
      }
    }

    visiting.delete(stepId);
    visited.add(stepId);
    return false;
  }

  for (const step of steps) {
    if (dfs(step.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['steps'],
        message: '工作流图存在循环依赖（仅支持 DAG）',
      });
      break;
    }
  }
}

const WorkflowTriggerConfigSchema = z.object({
  app_token: z.string().min(1).optional(),
  table_id: z.string().min(1).optional(),
  action: z.string().min(1).optional(),
  actions: z.array(z.string().min(1)).optional(),
  eventType: z.string().min(1).optional(),
  eventTypes: z.array(WORKFLOW_EVENT_TYPE_ENUM).optional(),
}).passthrough();

export const WorkflowTriggerSchema = z.object({
  type: z.string(),
  config: WorkflowTriggerConfigSchema,
});

export const WorkflowStepSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  name: z.string().optional(),
  config: z.record(z.unknown()),
  when: WorkflowConditionSchema.optional(),
  templatePolicy: WorkflowTemplatePolicySchema.optional(),
  next: z.string().min(1).optional(),
  onTrue: z.string().min(1).optional(),
  onFalse: z.string().min(1).optional(),
}).superRefine((step, ctx) => {
  if (step.type !== 'condition') {
    return;
  }

  const parsed = WorkflowConditionSchema.safeParse(step.config);
  if (parsed.success) {
    return;
  }

  for (const issue of parsed.error.issues) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['config', ...issue.path],
      message: `condition 步骤配置不合法: ${issue.message}`,
    });
  }
});

export const WorkflowConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  trigger: WorkflowTriggerSchema,
  steps: z.array(WorkflowStepSchema).min(1),
}).superRefine((config, ctx) => {
  validateWorkflowGraph(config.steps, ctx);
});

// Helper to validate a workflow config
export function validateWorkflowConfig(config: unknown) {
  return WorkflowConfigSchema.parse(config);
}
