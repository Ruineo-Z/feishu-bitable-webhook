import { ActionHandler, ActionResult } from './registry'
import { client } from '../client'
import { ActionParams } from '../db/rules'
import { logger, createLoggerWithTrace } from '../logger'
import { fieldMappingsDb } from '../db/field-mappings'

type BitableFieldPayloadValue =
  | string
  | number
  | boolean
  | string[]
  | { text?: string; link?: string }
  | {
      location?: string
      pname?: string
      cityname?: string
      adname?: string
      address?: string
      name?: string
      full_address?: string
    }
  | { id: string }[]

type BitableFieldPayload = Record<string, BitableFieldPayloadValue>

interface ActionContext extends Record<string, unknown> {
  traceId?: string
  field_mappings?: Record<string, string>
}

async function getFieldMappingsForTable(appToken: string, tableId: string): Promise<Record<string, string>> {
  try {
    return await fieldMappingsDb.getIdToNameMap(appToken, tableId)
  } catch {
    return {}
  }
}

const createRecord: ActionHandler = {
  async execute(params: ActionParams, context: Record<string, unknown>): Promise<ActionResult> {
    const { app_token, table_id, fields } = params
    const ctx = context as ActionContext
    const log = ctx.traceId ? createLoggerWithTrace(ctx.traceId, 'create-record.ts') : logger

    if (!app_token || !table_id || !fields) {
      throw new Error('Missing required params: app_token, table_id, or fields')
    }

    const fieldMappings = await getFieldMappingsForTable(app_token, table_id)

    const fieldsWithNames: Record<string, unknown> = {}
    for (const [fieldId, value] of Object.entries(fields as Record<string, unknown>)) {
      if (value === null || value === undefined) {
        continue
      }
      const fieldName = fieldMappings[fieldId] || fieldId
      fieldsWithNames[fieldName] = value
    }

    const startTime = Date.now()

    try {
      const res = await client.bitable.v1.appTableRecord.create({
        path: {
          app_token,
          table_id,
        },
        params: {
          user_id_type: 'open_id',
        },
        data: {
          fields: fieldsWithNames as BitableFieldPayload,
        },
      })

      if (res?.code && res.code !== 0) {
        return {
          success: false,
          error: res?.msg || 'create_record_failed',
          response: res as unknown as Record<string, unknown>,
          durationMs: Date.now() - startTime,
        }
      }

      const recordId = res?.data?.record?.record_id

      return {
        success: true,
        response: { recordId },
        durationMs: Date.now() - startTime,
      }
    } catch (error: any) {
      log.error('[create-record] 错误响应:', JSON.stringify(error?.response?.data, null, 2))
      return {
        success: false,
        error: error?.response?.data?.msg || error?.message || String(error),
        durationMs: Date.now() - startTime,
      }
    }
  },
}

export default createRecord
