import { ActionHandler, ActionResult } from './registry'
import client from '../lark'
import { logger, createLoggerWithTrace } from '../logger'

const updateRecord: ActionHandler = {
  async execute(params, context): Promise<ActionResult> {
    const { app_token, table_id, record_id, fields } = params
    const traceId = (context as { traceId?: string }).traceId
    const log = traceId ? createLoggerWithTrace(traceId, 'update-record.ts') : logger

    if (!app_token || !table_id || !record_id || !fields) {
      throw new Error('Missing required params: app_token, table_id, record_id, or fields')
    }

    const startTime = Date.now()

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
      })

      return {
        success: true,
        response: { recordId: record_id },
        durationMs: Date.now() - startTime
      }
    } catch (error) {
      log.error('[update-record] 更新失败:', error)
      throw new Error(`Failed to update record: ${error}`)
    }
  }
}

export default updateRecord
