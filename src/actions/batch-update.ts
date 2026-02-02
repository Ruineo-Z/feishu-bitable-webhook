import { ActionHandler, ActionResult } from './registry'
import client from '../lark'
import { logger } from '../logger'
import { ActionParams } from '../db/rules'

interface BatchUpdateParams {
  app_token: string
  table_id: string
  records: Array<{
    record_id: string
    fields: Record<string, unknown>
  }>
}

const batchUpdate: ActionHandler = {
  async execute(params: ActionParams, context: Record<string, unknown>): Promise<ActionResult> {
    const { app_token, table_id, records } = params as unknown as BatchUpdateParams

    if (!app_token || !table_id || !records || !Array.isArray(records)) {
      throw new Error('Missing required params: app_token, table_id, or records (must be array)')
    }

    logger.info('[batch-update] 请求参数:', JSON.stringify({ app_token, table_id, recordsCount: records.length }, null, 2))

    const startTime = Date.now()

    try {
      const res = await client.bitable.v1.appTableRecord.batchUpdate({
        path: {
          app_token,
          table_id
        },
        data: {
          records: records.map(r => ({
            record_id: r.record_id,
            fields: r.fields as Record<string, any>
          }))
        }
      })

      const updatedRecords = res.data?.records || []
      logger.info('[batch-update] 成功更新:', updatedRecords.length, '条记录')

      return {
        success: true,
        response: {
          updatedCount: updatedRecords.length,
          records: updatedRecords.map((r: any) => ({
            recordId: r.record_id,
            fields: r.fields
          }))
        },
        durationMs: Date.now() - startTime
      }
    } catch (error: any) {
      logger.error('[batch-update] 错误:', error?.response?.data || error)
      throw new Error(`Failed to batch update records: ${error}`)
    }
  }
}

export default batchUpdate
