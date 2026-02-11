import { IWorkflowPlugin, WorkflowContext, StepResult } from '../types'
import { client } from '../../client'
import { createLoggerWithTrace } from '../../logger'
import { CodecWarning, encodeFieldValueForFilter, FieldCodecError, formatCodecWarnings } from '../codec'
import { loadFieldResolverMaps, resolveFieldMeta } from './field-mapping-resolver'
import { extractFeishuErrorPayload } from './feishu-error'
import { okStep, errStep } from './step-result'

type FilterOperator = 'is' | 'isNot' | 'contains' | 'doesNotContain' | 'isEmpty' | 'isNotEmpty' | 'isGreater' | 'isGreaterEqual' | 'isLess' | 'isLessEqual' | 'like' | 'in'

interface SearchFilter {
  conjunction: 'and' | 'or'
  conditions?: Array<{
    field_name: string
    operator: FilterOperator
    value?: unknown
  }>
}

const EMPTY_VALUE_OPERATORS = new Set<FilterOperator>(['isEmpty', 'isNotEmpty'])

export class BitableDeletePlugin implements IWorkflowPlugin {
  async execute(context: WorkflowContext, config: Record<string, unknown>): Promise<StepResult> {
    const startTime = Date.now()
    const { app_token, table_id, record_id, filter } = config
    let resolvedFilterForDebug: SearchFilter | null = null

    if (!app_token || !table_id) {
      return errStep(
        'VALIDATION_ERROR',
        'Missing required config: app_token or table_id',
        Date.now() - startTime,
      )
    }

    try {
      const resolverMaps = await loadFieldResolverMaps(String(app_token), String(table_id))
      let targetRecordId = record_id ? String(record_id) : ''
      const codecWarnings: CodecWarning[] = []

      if (!targetRecordId) {
        if (!filter || typeof filter !== 'object') {
          return errStep(
            'VALIDATION_ERROR',
            'Missing required config: record_id or filter',
            Date.now() - startTime,
          )
        }

        const rawFilter = filter as SearchFilter
        const invalidConditions: Array<{ field_name: string; operator: FilterOperator }> = []
        const resolvedConditions = (rawFilter.conditions || []).map((condition) => {
          const resolved = resolveFieldMeta(condition.field_name, resolverMaps)
          if (resolved.missing) {
            throw new Error(`Missing field mapping for field ID: ${condition.field_name}`)
          }

          const encodedValue = encodeFieldValueForFilter(condition.value, {
            appToken: String(app_token),
            tableId: String(table_id),
            fieldName: resolved.fieldName,
            fieldId: resolved.fieldId,
            rawFieldType: resolved.fieldType,
            operator: condition.operator,
          })
          codecWarnings.push(...encodedValue.warnings)
          const requiresNonEmptyValue = !EMPTY_VALUE_OPERATORS.has(condition.operator)
          const hasValue = Array.isArray(encodedValue.value) && encodedValue.value.length > 0
          if (requiresNonEmptyValue && !hasValue) {
            invalidConditions.push({
              field_name: resolved.fieldName,
              operator: condition.operator,
            })
          }

          return {
            ...condition,
            field_name: resolved.fieldName,
            value: encodedValue.value,
          }
        })

        if (invalidConditions.length > 0) {
          const logger = createLoggerWithTrace(context.trigger?.traceId || 'WF-CODEC', 'bitable-delete.ts')
          logger.warn('delete filter 条件值为空，跳过删除', {
            invalidConditions,
          })

          return okStep(
            {
              deleted: false,
              reason: 'filter_value_missing',
              invalidConditions,
              warnings: formatCodecWarnings(codecWarnings),
            },
            Date.now() - startTime,
          )
        }

        resolvedFilterForDebug = {
          conjunction: rawFilter.conjunction || 'and',
          conditions: resolvedConditions,
        }

        const searchRes = await (client as any).bitable.v1.appTableRecord.search({
          path: {
            app_token,
            table_id,
          },
          params: {
            page_size: 1,
            user_id_type: 'open_id',
          },
        data: {
            filter: resolvedFilterForDebug,
          },
        })

        if (searchRes?.code && searchRes.code !== 0) {
          return errStep(
            'FEISHU_API_ERROR',
            searchRes?.msg || 'Failed to search records before delete',
            Date.now() - startTime,
            searchRes,
          )
        }

        const items = searchRes?.data?.items || []
        if (items.length === 0) {
          if (codecWarnings.length > 0) {
            const logger = createLoggerWithTrace(context.trigger?.traceId || 'WF-CODEC', 'bitable-delete.ts')
            logger.warn('delete filter 字段 codec 降级透传', formatCodecWarnings(codecWarnings))
          }

          return okStep(
            {
              deleted: false,
              reason: 'no_matching_record',
              warnings: formatCodecWarnings(codecWarnings),
            },
            Date.now() - startTime,
          )
        }

        targetRecordId = String(items[0].record_id)
      }

      const res = await (client as any).bitable.v1.appTableRecord.delete({
        path: {
          app_token,
          table_id,
          record_id: targetRecordId,
        },
      })

      if (res?.code && res.code !== 0) {
        return errStep(
          'FEISHU_API_ERROR',
          res?.msg || 'Failed to delete record',
          Date.now() - startTime,
          res,
        )
      }

      if (codecWarnings.length > 0) {
        const logger = createLoggerWithTrace(context.trigger?.traceId || 'WF-CODEC', 'bitable-delete.ts')
        logger.warn('delete filter 字段 codec 降级透传', formatCodecWarnings(codecWarnings))
      }

      return okStep(
        {
          deleted: true,
          recordId: targetRecordId,
          warnings: formatCodecWarnings(codecWarnings),
        },
        Date.now() - startTime,
      )
    } catch (error: any) {
      if (error instanceof FieldCodecError) {
        return errStep(
          error.code,
          error.message,
          Date.now() - startTime,
          error.details,
        )
      }

      const feishuError = extractFeishuErrorPayload(error)
      if (feishuError) {
        const logger = createLoggerWithTrace(context.trigger?.traceId || 'WF-CODEC', 'bitable-delete.ts')
        logger.error('delete 调用飞书接口失败', {
          feishuError,
          filter: resolvedFilterForDebug,
        })

        const feishuMessage = feishuError.msg || feishuError.message || 'Failed to delete record'
        const message = (feishuMessage === 'InvalidFilter' && resolvedFilterForDebug)
          ? `InvalidFilter: ${JSON.stringify(resolvedFilterForDebug)}`
          : feishuMessage
        return errStep(
          'FEISHU_API_ERROR',
          message,
          Date.now() - startTime,
          {
            ...feishuError,
            filter: resolvedFilterForDebug,
          },
        )
      }

      return errStep(
        'PLUGIN_ERROR',
        `Failed to delete record: ${error.message || error}`,
        Date.now() - startTime,
      )
    }
  }
}
