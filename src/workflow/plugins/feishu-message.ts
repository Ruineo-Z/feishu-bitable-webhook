import { IWorkflowPlugin, WorkflowContext, StepResult } from '../types'
import { client } from '../../client'
import { okStep, errStep } from './step-result'
import { appendDryRunEffect, isDryRunContext } from './dry-run'

export class FeishuMessagePlugin implements IWorkflowPlugin {
  async execute(context: WorkflowContext, config: Record<string, unknown>): Promise<StepResult> {
    const startTime = Date.now()
    const { receive_id, receive_id_type, content } = config

    if (!receive_id || !content) {
      return errStep(
        'VALIDATION_ERROR',
        'Missing required config: receive_id or content',
        Date.now() - startTime,
      )
    }

    const receiveIdType = String(receive_id_type || 'open_id')
    const receiveId = String(receive_id)

    try {
      if (isDryRunContext(context)) {
        appendDryRunEffect(context, {
          action: 'feishu.message.create',
          target: {
            receive_id_type: receiveIdType,
            receive_id: receiveId,
          },
          payload: {
            content,
          },
        })

        return okStep(
          {
            dryRun: true,
            preview: {
              receive_id_type: receiveIdType,
              receive_id: receiveId,
              content,
            },
          },
          Date.now() - startTime,
        )
      }

      const res = await (client as any).im.v1.messages.create({
        body: {
          receive_id_type: receiveIdType,
          receive_id: receiveId,
          content,
        },
      })

      if (res?.code && res.code !== 0) {
        return errStep(
          'FEISHU_API_ERROR',
          res?.msg || 'Failed to send Feishu message',
          Date.now() - startTime,
          res,
        )
      }

      return okStep(
        {
          messageId: res?.data?.message_id,
        },
        Date.now() - startTime,
      )
    } catch (error: any) {
      return errStep(
        'PLUGIN_ERROR',
        `Failed to send Feishu message: ${error.message || error}`,
        Date.now() - startTime,
      )
    }
  }
}
