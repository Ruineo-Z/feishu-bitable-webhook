import { ActionHandler, ActionResult } from './registry'
import client from '../lark'
import { logger } from '../logger'
import { ActionParams } from '../db/rules'

interface QueryRecordsParams {
  app_token: string
  table_id: string
  filter?: {
    conjunction?: 'and' | 'or'
    conditions: Array<{
      field_name: string
      operator: 'is' | 'isNot' | 'contains' | 'doesNotContain' | 'isEmpty' | 'isNotEmpty' | 'isGreater' | 'isGreaterEqual' | 'isLess' | 'isLessEqual' | 'like' | 'in'
      value: string[]
    }>
  }
  sort?: Array<{
    field_name: string
    desc?: boolean
  }>
  page_size?: number
  page_token?: string
  field_names?: string[]
}

const queryRecords: ActionHandler = {
  async execute(params: ActionParams, context: Record<string, unknown>): Promise<ActionResult> {
    const { app_token, table_id, filter, sort, page_size = 50, page_token, field_names } = params as unknown as QueryRecordsParams

    if (!app_token || !table_id) {
      throw new Error('Missing required params: app_token or table_id')
    }

    logger.info('[query-records] 请求参数:', JSON.stringify({ app_token, table_id, filter, page_size }, null, 2))

    const startTime = Date.now()

    try {
      const res = await client.bitable.v1.appTableRecord.search({
        path: {
          app_token,
          table_id
        },
        params: {
          page_size,
          page_token,
          user_id_type: 'open_id'
        },
        data: {
          filter: filter ? {
            conjunction: filter.conjunction || 'and',
            conditions: filter.conditions
          } : undefined,
          sort,
          field_names
        }
      })

      const items = res.data?.items || []
      logger.info('[query-records] 查询到:', items.length, '条记录')

      return {
        success: true,
        response: {
          records: items.map((r: any) => ({
            recordId: r.record_id,
            fields: r.fields
          })),
          hasMore: res.data?.has_more,
          pageToken: res.data?.page_token,
          total: res.data?.total
        },
        durationMs: Date.now() - startTime
      }
    } catch (error: any) {
      logger.error('[query-records] 错误:', error?.response?.data || error)
      throw new Error(`Failed to query records: ${error}`)
    }
  }
}

export default queryRecords
