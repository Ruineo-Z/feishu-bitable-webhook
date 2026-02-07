import { IWorkflowPlugin, WorkflowContext, StepResult } from '../types';
import { client } from '../../client';

export class BitableUpdatePlugin implements IWorkflowPlugin {
  async execute(context: WorkflowContext, config: Record<string, unknown>): Promise<StepResult> {
    const { app_token, table_id, record_id, fields } = config;

    if (!app_token || !table_id || !record_id || !fields) {
      return {
        success: false,
        error: 'Missing required config: app_token, table_id, record_id, or fields'
      };
    }

    try {
      await (client as any).bitable.v1.appTableRecord.update({
        path: {
          app_token,
          table_id,
          record_id
        },
        data: {
          fields
        }
      });

      return {
        success: true,
        output: { recordId: record_id }
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to update record: ${error.message || error}`
      };
    }
  }
}
