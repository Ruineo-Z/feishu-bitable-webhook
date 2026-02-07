import { IWorkflowPlugin, WorkflowContext, StepResult } from '../types';
import { client } from '../../client';

export class FeishuMessagePlugin implements IWorkflowPlugin {
  async execute(context: WorkflowContext, config: Record<string, unknown>): Promise<StepResult> {
    const { receive_id, receive_id_type, content } = config;

    if (!receive_id || !content) {
      return {
        success: false,
        error: 'Missing required config: receive_id or content'
      };
    }

    try {
      // Cast client to any to avoid strict typing issues with the SDK
      const res = await (client as any).im.v1.messages.create({
        body: {
          receive_id_type: receive_id_type || 'open_id',
          receive_id,
          content
        }
      });

      return {
        success: true,
        output: { messageId: res.data?.message_id }
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to send Feishu message: ${error.message || error}`
      };
    }
  }
}
