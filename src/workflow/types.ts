export interface WorkflowConfig {
  id: string;
  name: string;
  trigger: WorkflowTrigger;
  steps: WorkflowStep[];
}

export interface WorkflowTrigger {
  type: string;
  config: Record<string, unknown>;
}

export interface WorkflowStep {
  id: string;
  type: string;
  name?: string;
  config: Record<string, unknown>;
  next?: string; // ID of the next step
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
}

export interface IWorkflowPlugin {
  execute(context: WorkflowContext, config: Record<string, unknown>): Promise<StepResult>;
}
