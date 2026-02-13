import { IWorkflowPlugin, WorkflowContext, StepResult } from '../types'
import { client } from '../../client'
import { createLoggerWithTrace } from '../../logger'
import { CodecWarning, encodeFieldValueForFilter, FieldCodecError, formatCodecWarnings } from '../codec'
import { loadFieldResolverMaps, resolveFieldMeta, resolveFieldNameList } from './field-mapping-resolver'
import { extractFeishuErrorPayload } from './feishu-error'
import { okStep, errStep } from './step-result'
import { appendDryRunEffect, isDryRunContext } from './dry-run'

type FilterOperator =
  | 'is'
  | 'isNot'
  | 'contains'
  | 'doesNotContain'
  | 'isEmpty'
  | 'isNotEmpty'
  | 'isGreater'
  | 'isGreaterEqual'
  | 'isLess'
  | 'isLessEqual'
  | 'like'
  | 'in'

interface QueryFilter {
  conjunction?: 'and' | 'or'
  conditions?: Array<{
    field_name: string
    operator: FilterOperator
    value?: unknown
  }>
}

interface QuerySort {
  field_name: string
  desc?: boolean
}

const EMPTY_VALUE_OPERATORS = new Set<FilterOperator>(['isEmpty', 'isNotEmpty'])

export class BitableQueryPlugin implements IWorkflowPlugin {
  async execute(context: WorkflowContext, config: Record<string, unknown>): Promise<StepResult> {
    const startTime = Date.now()
    let resolvedFilterForDebug: QueryFilter | undefined

    const {
      app_token,
      table_id,
      filter,
      sort,
      page_size = 50,
      page_token,
      field_names,
    } = config

    if (!app_token || !table_id) {
      return errStep(
        'VALIDATION_ERROR',
        'Missing required config: app_token or table_id',
        Date.now() - startTime,
      )
    }

    const appToken = String(app_token)
    const tableId = String(table_id)

    try {
      const resolverMaps = await loadFieldResolverMaps(appToken, tableId)
      const codecWarnings: CodecWarning[] = []

      let resolvedFilter: QueryFilter | undefined
      if (filter && typeof filter === 'object') {
        const rawFilter = filter as QueryFilter
        const invalidConditions: Array<{ field_name: string; operator: FilterOperator }> = []
        const resolvedConditions = (rawFilter.conditions || []).map((condition) => {
          const resolved = resolveFieldMeta(condition.field_name, resolverMaps)
          if (resolved.missing) {
            throw new Error(`Missing field mapping for field ID: ${condition.field_name}`)
          }

          const encodedValue = encodeFieldValueForFilter(condition.value, {
            appToken,
            tableId,
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
          const logger = createLoggerWithTrace(context.trigger?.traceId || 'WF-CODEC', 'bitable-query.ts')
          logger.warn('query filter 条件值为空，跳过查询', {
            invalidConditions,
          })

          return okStep(
            {
              records: [],
              total: 0,
              hasMore: false,
              pageToken: null,
              reason: 'filter_value_missing',
              invalidConditions,
              warnings: formatCodecWarnings(codecWarnings),
            },
            Date.now() - startTime,
          )
        }

        resolvedFilter = {
          conjunction: rawFilter.conjunction || 'and',
          conditions: resolvedConditions,
        }
        resolvedFilterForDebug = resolvedFilter
      }

      const resolvedSort = Array.isArray(sort)
        ? (sort as QuerySort[]).map((item) => {
            const resolved = resolveFieldMeta(item.field_name, resolverMaps)
            if (resolved.missing) {
              throw new Error(`Missing field mapping for field ID: ${item.field_name}`)
            }

            return {
              ...item,
              field_name: resolved.fieldName,
            }
          })
        : undefined

      const resolvedFieldNames = Array.isArray(field_names)
        ? resolveFieldNameList(field_names as string[], resolverMaps)
        : undefined

      if (resolvedFieldNames && resolvedFieldNames.missingFieldIds.length > 0) {
        return errStep(
          'FIELD_MAPPING_MISSING',
          `Missing field mapping for field IDs: ${resolvedFieldNames.missingFieldIds.join(', ')}`,
          Date.now() - startTime,
          { missingFieldIds: resolvedFieldNames.missingFieldIds },
        )
      }

      const queryPayload = {
        filter: resolvedFilter,
        sort: resolvedSort,
        field_names: resolvedFieldNames?.resolvedFieldNames,
        page_size: Number(page_size),
        page_token: page_token ? String(page_token) : undefined,
      }

      if (isDryRunContext(context)) {
        appendDryRunEffect(context, {
          action: 'bitable.record.query',
          target: {
            app_token: appToken,
            table_id: tableId,
          },
          payload: queryPayload,
        })

        return okStep(
          {
            dryRun: true,
            records: [],
            total: 0,
            hasMore: false,
            pageToken: null,
            preview: {
              app_token: appToken,
              table_id: tableId,
              ...queryPayload,
            },
            warnings: formatCodecWarnings(codecWarnings),
          },
          Date.now() - startTime,
        )
      }

      const res = await (client as any).bitable.v1.appTableRecord.search({
        path: {
          app_token: appToken,
          table_id: tableId,
        },
        params: {
          page_size: Number(page_size),
          page_token: page_token ? String(page_token) : undefined,
          user_id_type: 'open_id',
        },
        data: {
          filter: resolvedFilter,
          sort: resolvedSort,
          field_names: resolvedFieldNames?.resolvedFieldNames,
        },
      })

      if (res?.code && res.code !== 0) {
        return errStep(
          'FEISHU_API_ERROR',
          res?.msg || 'Failed to query records',
          Date.now() - startTime,
          res,
        )
      }

      const items = res?.data?.items || []

      if (codecWarnings.length > 0) {
        const logger = createLoggerWithTrace(context.trigger?.traceId || 'WF-CODEC', 'bitable-query.ts')
        logger.warn('query filter 字段 codec 降级透传', formatCodecWarnings(codecWarnings))
      }

      return okStep(
        {
          records: items.map((item: any) => ({
            recordId: item.record_id,
            fields: item.fields,
          })),
          total: res?.data?.total,
          hasMore: res?.data?.has_more,
          pageToken: res?.data?.page_token,
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
        const logger = createLoggerWithTrace(context.trigger?.traceId || 'WF-CODEC', 'bitable-query.ts')
        logger.error('query 调用飞书接口失败', {
          feishuError,
          filter: resolvedFilterForDebug,
        })

        const feishuMessage = feishuError.msg || feishuError.message || 'Failed to query records'
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
        `Failed to query records: ${error.message || error}`,
        Date.now() - startTime,
      )
    }
  }
}
