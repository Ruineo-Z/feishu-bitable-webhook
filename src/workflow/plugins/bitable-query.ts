import { IWorkflowPlugin, WorkflowContext, StepResult } from '../types'
import { client } from '../../client'
import { loadFieldResolverMaps, resolveFieldName, resolveFieldNameList } from './field-mapping-resolver'
import { okStep, errStep } from './step-result'

type FilterOperator = 'is' | 'isNot' | 'contains' | 'doesNotContain' | 'isEmpty' | 'isNotEmpty' | 'isGreater' | 'isGreaterEqual' | 'isLess' | 'isLessEqual' | 'like' | 'in'

interface QueryFilter {
  conjunction?: 'and' | 'or'
  conditions?: Array<{
    field_name: string
    operator: FilterOperator
    value?: string[]
  }>
}

interface QuerySort {
  field_name: string
  desc?: boolean
}


function normalizeFilterPrimitive(value: unknown): string {
  if (value === null || value === undefined) return ''

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  if (typeof value === 'object') {
    const candidate = value as Record<string, unknown>
    if (typeof candidate.id === 'string' || typeof candidate.id === 'number') {
      return String(candidate.id)
    }
    if (typeof candidate.user_id === 'string' || typeof candidate.user_id === 'number') {
      return String(candidate.user_id)
    }
    if (typeof candidate.open_id === 'string' || typeof candidate.open_id === 'number') {
      return String(candidate.open_id)
    }
    if (typeof candidate.text === 'string' || typeof candidate.text === 'number') {
      return String(candidate.text)
    }
    if (typeof candidate.name === 'string' || typeof candidate.name === 'number') {
      return String(candidate.name)
    }
    if (typeof candidate.value === 'string' || typeof candidate.value === 'number' || typeof candidate.value === 'boolean') {
      return String(candidate.value)
    }
  }

  return String(value)
}

function normalizeFilterValue(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeFilterPrimitive(item)).filter((item) => item !== '')
  }

  return [normalizeFilterPrimitive(value)].filter((item) => item !== '')
}

export class BitableQueryPlugin implements IWorkflowPlugin {
  async execute(context: WorkflowContext, config: Record<string, unknown>): Promise<StepResult> {
    const startTime = Date.now()

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

    try {
      const resolverMaps = await loadFieldResolverMaps(String(app_token), String(table_id))

      let resolvedFilter: QueryFilter | undefined
      if (filter && typeof filter === 'object') {
        const rawFilter = filter as QueryFilter
        const resolvedConditions = (rawFilter.conditions || []).map((condition) => {
          const resolved = resolveFieldName(condition.field_name, resolverMaps)
          if (resolved.missing) {
            throw new Error(`Missing field mapping for field ID: ${condition.field_name}`)
          }

          const normalizedValue = condition.value !== undefined
            ? normalizeFilterValue(condition.value)
            : undefined

          return {
            ...condition,
            field_name: resolved.fieldName,
            value: normalizedValue,
          }
        })

        resolvedFilter = {
          conjunction: rawFilter.conjunction || 'and',
          conditions: resolvedConditions,
        }
      }

      const resolvedSort = Array.isArray(sort)
        ? (sort as QuerySort[]).map((item) => {
            const resolved = resolveFieldName(item.field_name, resolverMaps)
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

      const res = await (client as any).bitable.v1.appTableRecord.search({
        path: {
          app_token,
          table_id,
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

      return okStep(
        {
          records: items.map((item: any) => ({
            recordId: item.record_id,
            fields: item.fields,
          })),
          total: res?.data?.total,
          hasMore: res?.data?.has_more,
          pageToken: res?.data?.page_token,
        },
        Date.now() - startTime,
      )
    } catch (error: any) {
      return errStep(
        'PLUGIN_ERROR',
        `Failed to query records: ${error.message || error}`,
        Date.now() - startTime,
      )
    }
  }
}
