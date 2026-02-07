import { z } from 'zod';

export const WorkflowTriggerSchema = z.object({
  type: z.string(),
  config: z.record(z.unknown()),
});

export const WorkflowStepSchema = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string().optional(),
  config: z.record(z.unknown()),
  next: z.string().optional(),
});

export const WorkflowConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  trigger: WorkflowTriggerSchema,
  steps: z.array(WorkflowStepSchema),
});

// Helper to validate a workflow config
export function validateWorkflowConfig(config: unknown) {
  return WorkflowConfigSchema.parse(config);
}
