import { ActionHandler, ActionResult } from './registry'
import client from '../lark'
import { ActionParams } from '../db/rules'
import { logger, createLoggerWithTrace } from '../logger'
import { getSupabase } from '../db/client'

interface ActionContext extends Record<string, unknown> {
  traceId?: string
  field_mappings?: Record<string, string>
}

// 根据 table_id 获取字段映射
async function getFieldMappingsForTable(tableId: string): Promise<Record<string, string>> {
  try {
    const { data } = await getSupabase()
      .from('bitables')
      .select('field_mappings')
      .eq('table_id', tableId)
      .single()

    return (data?.field_mappings as Record<string, string>) || {}
  } catch {
    return {}
  }
}

const createRecord: ActionHandler = {
  async execute(params: ActionParams, context: Record<string, unknown>): Promise<ActionResult> {
    const { app_token, table_id, fields } = params
    const ctx = context as ActionContext
    const log = ctx.traceId ? createLoggerWithTrace(ctx.traceId, 'create-record.ts') : logger

    log.info('[create-record] context.field_mappings:', JSON.stringify(ctx.field_mappings || {}, null, 2))

    if (!app_token || !table_id || !fields) {
      throw new Error('Missing required params: app_token, table_id, or fields')
    }

    // 获取目标表的字段映射
    const fieldMappings = await getFieldMappingsForTable(table_id)
    log.info('[create-record] 目标表字段映射:', JSON.stringify(fieldMappings, null, 2))

    // 转换 fields 中的字段 ID 为字段名称
    const fieldsWithNames: Record<string, unknown> = {}
    for (const [fieldId, value] of Object.entries(fields as Record<string, unknown>)) {
      const fieldName = fieldMappings[fieldId] || fieldId
      fieldsWithNames[fieldName] = value
      log.info('[create-record] 字段转换:', fieldId, '->', fieldName)
    }

    log.info('[create-record] 转换后 fields:', JSON.stringify(fieldsWithNames, null, 2))

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
          fields: fieldsWithNames
        }
      })

      log.info('[create-record] 响应:', JSON.stringify(res, null, 2))

      const recordId = res?.data?.record?.record_id

      return {
        success: true,
        response: { recordId },
        durationMs: Date.now() - startTime
      }
    } catch (error: any) {
      log.error('[create-record] 错误响应:', JSON.stringify(error?.response?.data, null, 2))
      return {
        success: false,
        error: error?.response?.data?.msg || error?.message || String(error),
        durationMs: Date.now() - startTime
      }
    }
  }
}

export default createRecord
