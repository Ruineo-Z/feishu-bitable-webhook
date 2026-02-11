export interface WorkflowConfig {
  id: string;
  name: string;
  trigger: WorkflowTrigger;
  steps: WorkflowStep[];
}

export type ConditionSource = 'before' | 'after';

export interface ConditionExpression {
  field: string;
  operator: string;
  value?: unknown;
  source?: ConditionSource;
}

export interface WorkflowCondition {
  logic: 'AND' | 'OR';
  expressions: ConditionExpression[];
}

export type WorkflowTemplatePolicy = 'fail' | 'skip';

export interface WorkflowTrigger {
  type: string;
  config: Record<string, unknown>;
}

export interface WorkflowStep {
  id: string;
  type: string;
  name?: string;
  config: Record<string, unknown>;
  when?: WorkflowCondition;
  templatePolicy?: WorkflowTemplatePolicy;
  next?: string;
  onTrue?: string;
  onFalse?: string;
}

export interface WorkflowContext {
  trigger: any;
  steps: Record<string, StepResult>;
  // Global variables or helpers can be added here
}

export interface StepResult {
  success: boolean;
  output?: any;
  error?: string;
  skipped?: boolean;
}

export interface IWorkflowPlugin {
  execute(context: WorkflowContext, config: Record<string, unknown>): Promise<StepResult>;
}
