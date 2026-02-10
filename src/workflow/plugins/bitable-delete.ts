import { IWorkflowPlugin, WorkflowContext, StepResult } from '../types'
import { client } from '../../client'
import { loadFieldResolverMaps, resolveFieldName } from './field-mapping-resolver'
import { okStep, errStep } from './step-result'

type FilterOperator = 'is' | 'isNot' | 'contains' | 'doesNotContain' | 'isEmpty' | 'isNotEmpty' | 'isGreater' | 'isGreaterEqual' | 'isLess' | 'isLessEqual' | 'like' | 'in'

interface SearchFilter {
  conjunction: 'and' | 'or'
  conditions?: Array<{
    field_name: string
    operator: FilterOperator
    value?: string[]
  }>
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

export class BitableDeletePlugin implements IWorkflowPlugin {
  async execute(context: WorkflowContext, config: Record<string, unknown>): Promise<StepResult> {
    const startTime = Date.now()
    const { app_token, table_id, record_id, filter } = config

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

      if (!targetRecordId) {
        if (!filter || typeof filter !== 'object') {
          return errStep(
            'VALIDATION_ERROR',
            'Missing required config: record_id or filter',
            Date.now() - startTime,
          )
        }

        const rawFilter = filter as SearchFilter
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
            filter: {
              conjunction: rawFilter.conjunction || 'and',
              conditions: resolvedConditions,
            },
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
          return okStep(
            {
              deleted: false,
              reason: 'no_matching_record',
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

      return okStep(
        {
          deleted: true,
          recordId: targetRecordId,
        },
        Date.now() - startTime,
      )
    } catch (error: any) {
      return errStep(
        'PLUGIN_ERROR',
        `Failed to delete record: ${error.message || error}`,
        Date.now() - startTime,
      )
    }
  }
}
