import { ActionHandler, ActionResult } from './registry'
import client from '../lark'
import { logger, createLoggerWithTrace } from '../logger'

function resolveFieldValue(value: unknown): unknown {
  if (typeof value === 'object' && value !== null && 'field' in (value as Record<string, unknown>)) {
    const fieldRef = value as { field: string }
    const fieldName = fieldRef.field

    // 从 context 中获取实际值（这里简化处理，假设外部已解析）
    return value
  }
  return value
}

function formatSearchValue(value: unknown): string[] {
  if (value === null || value === undefined) {
    return ['']
  }

  // 处理数组格式
  if (Array.isArray(value)) {
    const ids: string[] = []
    for (const item of value) {
      if (typeof item === 'object' && item !== null) {
        const itemObj = item as Record<string, unknown>
        // 人员字段格式：[{id: "open_id"}]
        if ('id' in itemObj && typeof itemObj.id === 'string') {
          ids.push(itemObj.id)
        }
        // 富文本格式：[{type: "text", text: "xxx"}]
        if (itemObj.type === 'text' && typeof itemObj.text === 'string') {
          ids.push(itemObj.text)
        }
      }
    }
    return ids.length > 0 ? ids : ['']
  }

  // 处理对象格式（非数组）
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>

    // 人员字段格式：{id: "open_id"}
    if ('id' in obj && typeof obj.id === 'string') {
      return [obj.id]
    }

    // 富文本格式：{type: "text", text: "xxx"}
    if (obj.type === 'text' && typeof obj.text === 'string') {
      return [obj.text]
    }
  }

  // 普通值直接转字符串
  return [String(value)]
}

function resolveFilterValue(value: unknown, context: Record<string, unknown>): unknown {
  if (typeof value === 'object' && value !== null && 'field' in (value as Record<string, unknown>)) {
    const fieldName = (value as { field: string }).field
    const isBeforeField = fieldName.startsWith('before:')
    const actualFieldName = isBeforeField ? fieldName.slice(7) : fieldName
    const sourceRecord = isBeforeField
      ? (context.beforeRecord as Record<string, unknown>)
      : (context.record as Record<string, unknown>)
    return sourceRecord?.[actualFieldName]
  }
  return value
}

const deleteRecord: ActionHandler = {
  async execute(params, context): Promise<ActionResult> {
    const { app_token, table_id, record_id, filter_fields } = params
    const traceId = (context as { traceId?: string }).traceId
    const log = traceId ? createLoggerWithTrace(traceId, 'delete-record.ts') : logger

    let targetRecordId = record_id

    // 如果没有直接指定 record_id，但提供了 filter_fields，则先搜索
    if (!targetRecordId && filter_fields && typeof filter_fields === 'object') {
      if (!app_token || !table_id) {
        throw new Error('Missing required params: app_token or table_id')
      }
      log.info('[delete-record] 未指定 record_id，尝试按条件搜索...')

      // 解析 filter_fields 中的 field 引用
      const resolvedFilters: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(filter_fields as Record<string, unknown>)) {
        resolvedFilters[key] = resolveFilterValue(value, context)
      }

      log.info('[delete-record] 解析后的搜索条件:', JSON.stringify(resolvedFilters, null, 2))

      try {
        const searchConditions: Array<{ field_name: string; operator: 'in' | 'is'; value: string[] }> =
          Object.entries(resolvedFilters).map(([field, value]) => ({
            field_name: field,
            operator: Array.isArray(value) && value.length > 1 ? 'in' : 'is',
            value: formatSearchValue(value)
          }))

        log.info('[delete-record] 搜索请求体:', JSON.stringify({
          filter: {
            conjunction: 'and',
            conditions: searchConditions
          }
        }, null, 2))

        const searchResult = await client.bitable.v1.appTableRecord.search({
          path: { app_token, table_id },
          params: {
            user_id_type: 'open_id'
          },
          data: {
            filter: {
              conjunction: 'and',
              conditions: searchConditions
            }
          }
        })

        log.info('[delete-record] 搜索响应:', JSON.stringify(searchResult.data?.items || [], null, 2))

        const records = searchResult.data?.items || []
        if (records.length === 0) {
          log.info('[delete-record] 未找到匹配记录，跳过删除')
          return {
            success: true,
            response: { deleted: false, reason: 'no_matching_record' },
            durationMs: 0
          }
        }

        targetRecordId = records[0].record_id
        log.info('[delete-record] 找到匹配记录:', targetRecordId)
      } catch (error) {
        throw new Error(`Failed to search records: ${error}`)
      }
    }

    if (!app_token || !table_id || !targetRecordId) {
      throw new Error('Missing required params: app_token, table_id, or record_id')
    }

    const startTime = Date.now()

    try {
      await client.bitable.v1.appTableRecord.delete({
        path: {
          app_token,
          table_id,
          record_id: targetRecordId
        }
      })

      return {
        success: true,
        response: { recordId: targetRecordId, deleted: true },
        durationMs: Date.now() - startTime
      }
    } catch (error) {
      throw new Error(`Failed to delete record: ${error}`)
    }
  }
}

export default deleteRecord
