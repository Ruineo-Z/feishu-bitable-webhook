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

export type WorkflowRunMode = 'live' | 'dry-run';

export interface DryRunEffect {
  stepId: string;
  stepType: string;
  action: string;
  target?: Record<string, unknown>;
  payload?: unknown;
}

export interface WorkflowRuntimeMeta {
  mode: WorkflowRunMode;
  currentStepId?: string;
  currentStepType?: string;
  dryRun: {
    effects: DryRunEffect[];
  };
}

export interface WorkflowContext {
  trigger: any;
  steps: Record<string, StepResult>;
  runtime: WorkflowRuntimeMeta;
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
