import { ActionHandler, ActionResult } from './registry'
import client from '../lark'
import { logger } from '../logger'
import { ActionParams } from '../db/rules'

interface BatchDeleteParams {
  app_token: string
  table_id: string
  record_ids: string[]
}

const batchDelete: ActionHandler = {
  async execute(params: ActionParams, context: Record<string, unknown>): Promise<ActionResult> {
    const { app_token, table_id, record_ids } = params as unknown as BatchDeleteParams

    if (!app_token || !table_id || !record_ids || !Array.isArray(record_ids)) {
      throw new Error('Missing required params: app_token, table_id, or record_ids (must be array)')
    }

    logger.info('[batch-delete] 请求参数:', JSON.stringify({ app_token, table_id, recordsCount: record_ids.length }, null, 2))

    const startTime = Date.now()

    try {
      await client.bitable.v1.appTableRecord.batchDelete({
        path: {
          app_token,
          table_id
        },
        data: {
          records: record_ids.map(id => ({ record_id: String(id) }))
        }
      })

      logger.info('[batch-delete] 成功删除:', record_ids.length, '条记录')

      return {
        success: true,
        response: {
          deletedCount: record_ids.length,
          recordIds: record_ids
        },
        durationMs: Date.now() - startTime
      }
    } catch (error: any) {
      logger.error('[batch-delete] 错误:', error?.response?.data || error)
      throw new Error(`Failed to batch delete records: ${error}`)
    }
  }
}

export default batchDelete
