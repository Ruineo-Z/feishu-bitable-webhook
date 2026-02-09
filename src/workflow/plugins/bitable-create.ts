import { IWorkflowPlugin, WorkflowContext, StepResult } from '../types'
import { client } from '../../client'
import { loadFieldResolverMaps, resolveFieldObjectKeys } from './field-mapping-resolver'
import { okStep, errStep } from './step-result'

export class BitableCreatePlugin implements IWorkflowPlugin {
  async execute(context: WorkflowContext, config: Record<string, unknown>): Promise<StepResult> {
    const startTime = Date.now()
    const { app_token, table_id, fields } = config

    if (!app_token || !table_id || !fields || typeof fields !== 'object') {
      return errStep(
        'VALIDATION_ERROR',
        'Missing required config: app_token, table_id, or fields',
        Date.now() - startTime,
      )
    }

    try {
      const resolverMaps = await loadFieldResolverMaps(String(app_token), String(table_id))
      const { resolvedFields, missingFieldIds } = resolveFieldObjectKeys(
        fields as Record<string, unknown>,
        resolverMaps,
      )

      if (missingFieldIds.length > 0) {
        return errStep(
          'FIELD_MAPPING_MISSING',
          `Missing field mapping for field IDs: ${missingFieldIds.join(', ')}`,
          Date.now() - startTime,
          { missingFieldIds },
        )
      }

      const res = await (client as any).bitable.v1.appTableRecord.create({
        path: {
          app_token,
          table_id,
        },
        params: {
          user_id_type: 'open_id',
        },
        data: {
          fields: resolvedFields,
        },
      })

      if (res?.code && res.code !== 0) {
        return errStep(
          'FEISHU_API_ERROR',
          res?.msg || 'Failed to create record',
          Date.now() - startTime,
          res,
        )
      }

      const recordId = res?.data?.record?.record_id

      return okStep(
        {
          recordId,
        },
        Date.now() - startTime,
      )
    } catch (error: any) {
      return errStep(
        'PLUGIN_ERROR',
        `Failed to create record: ${error.message || error}`,
        Date.now() - startTime,
      )
    }
  }
}
