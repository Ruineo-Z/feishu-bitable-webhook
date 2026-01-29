import { ActionHandler, ActionResult } from './registry'
import client from '../lark'
import { ActionParams } from '../db/rules'
import { logger } from '../logger'

const createRecord: ActionHandler = {
  async execute(params: ActionParams, context: Record<string, unknown>): Promise<ActionResult> {
    const { app_token, table_id, fields } = params

    if (!app_token || !table_id || !fields) {
      throw new Error('Missing required params: app_token, table_id, or fields')
    }

    logger.info('[create-record] 请求参数:', JSON.stringify({ app_token, table_id, fields }, null, 2))

    const startTime = Date.now()

    try {
      const res = await client.bitable.v1.appTableRecord.create({
        path: {
          app_token,
          table_id
        },
        params: {
          user_id_type: 'open_id'
        },
        data: {
          fields
        }
      })

      logger.info('[create-record] 响应:', JSON.stringify(res, null, 2))

      const recordId = res?.data?.record?.record_id

      return {
        success: true,
        response: { recordId },
        durationMs: Date.now() - startTime
      }
    } catch (error: any) {
      logger.error('[create-record] 错误响应:', JSON.stringify(error?.response?.data, null, 2))
      throw new Error(`Failed to create record: ${error}`)
    }
  }
}

export default createRecord
