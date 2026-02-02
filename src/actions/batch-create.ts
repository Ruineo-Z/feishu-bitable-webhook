import { ActionHandler, ActionResult } from './registry'
import client from '../lark'
import { logger } from '../logger'
import { ActionParams } from '../db/rules'

interface BatchCreateParams {
  app_token: string
  table_id: string
  records: Array<{
    fields: Record<string, unknown>
  }>
}

const batchCreate: ActionHandler = {
  async execute(params: ActionParams, context: Record<string, unknown>): Promise<ActionResult> {
    const { app_token, table_id, records } = params as unknown as BatchCreateParams

    if (!app_token || !table_id || !records || !Array.isArray(records)) {
      throw new Error('Missing required params: app_token, table_id, or records (must be array)')
    }

    logger.info('[batch-create] 请求参数:', JSON.stringify({ app_token, table_id, recordsCount: records.length }, null, 2))

    const startTime = Date.now()

    try {
      const res = await client.bitable.v1.appTableRecord.batchCreate({
        path: {
          app_token,
          table_id
        },
        data: {
          records: records.map(r => ({ fields: r.fields as Record<string, any> }))
        }
      })

      const createdRecords = res.data?.records || []
      logger.info('[batch-create] 成功创建:', createdRecords.length, '条记录')

      return {
        success: true,
        response: {
          createdCount: createdRecords.length,
          records: createdRecords.map((r: any) => ({
            recordId: r.record_id,
            fields: r.fields
          }))
        },
        durationMs: Date.now() - startTime
      }
    } catch (error: any) {
      logger.error('[batch-create] 错误:', error?.response?.data || error)
      throw new Error(`Failed to batch create records: ${error}`)
    }
  }
}

export default batchCreate
