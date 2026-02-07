import { WorkflowConfig, WorkflowContext, StepResult } from '../types';
import { ContextManager } from './context';
import { PluginRegistry } from './registry';
import { createFeishuLogger } from '../../logger';

export class WorkflowEngine {
  private registry: PluginRegistry;
  private logger = createFeishuLogger('WORKFLOW');

  constructor() {
    this.registry = PluginRegistry.getInstance();
  }

  /**
   * Executes a workflow with the given trigger context.
   */
  public async execute(workflow: WorkflowConfig, triggerContext: any): Promise<WorkflowContext> {
    const traceId = triggerContext.traceId || `wf-${Date.now()}`;
    const log = createFeishuLogger(traceId);
    log.info(`开始执行工作流: ${workflow.name} (${workflow.id})`);

    const contextManager = new ContextManager(triggerContext);

    // Simple sequential execution for now
    // In the future, we can follow the 'next' pointers for a graph structure
    for (const step of workflow.steps) {
      log.info(`执行步骤: ${step.name || step.id} (${step.type})`);

      try {
        const plugin = this.registry.get(step.type);
        if (!plugin) {
          throw new Error(`未找到插件类型: ${step.type}`);
        }

        // Resolve configuration variables
        const resolvedConfig = contextManager.substituteDeep(step.config);

        // Execute the step
        const startTime = Date.now();
        const result: StepResult = await plugin.execute(contextManager.getContext(), resolvedConfig);
        const duration = Date.now() - startTime;

        // Store result
        contextManager.setStepResult(step.id, result);

        if (result.success) {
          log.success(`步骤 ${step.id} 执行成功 (${duration}ms)`);
        } else {
          log.error(`步骤 ${step.id} 执行失败: ${result.error}`);
          // Stop execution on failure
          break;
        }

      } catch (error: any) {
        log.error(`步骤 ${step.id} 执行异常:`, error);
        contextManager.setStepResult(step.id, {
          success: false,
          error: error.message || String(error)
        });
        break; // Stop execution on error
      }
    }

    log.info(`工作流 ${workflow.id} 执行结束`);
    return contextManager.getContext();
  }
}
