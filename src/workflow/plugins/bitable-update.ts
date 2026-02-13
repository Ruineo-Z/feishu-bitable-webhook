import { IWorkflowPlugin, WorkflowContext, StepResult } from '../types'
import { client } from '../../client'
import { loadFieldResolverMaps, resolveFieldObjectKeys } from './field-mapping-resolver'
import { okStep, errStep } from './step-result'
import { appendDryRunEffect, isDryRunContext } from './dry-run'

export class BitableUpdatePlugin implements IWorkflowPlugin {
  async execute(context: WorkflowContext, config: Record<string, unknown>): Promise<StepResult> {
    const startTime = Date.now()
    const { app_token, table_id, record_id, fields } = config

    if (!app_token || !table_id || !record_id || !fields || typeof fields !== 'object') {
      return errStep(
        'VALIDATION_ERROR',
        'Missing required config: app_token, table_id, record_id, or fields',
        Date.now() - startTime,
      )
    }

    const appToken = String(app_token)
    const tableId = String(table_id)
    const recordId = String(record_id)

    try {
      const resolverMaps = await loadFieldResolverMaps(appToken, tableId)
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

      if (isDryRunContext(context)) {
        appendDryRunEffect(context, {
          action: 'bitable.record.update',
          target: {
            app_token: appToken,
            table_id: tableId,
            record_id: recordId,
          },
          payload: {
            fields: resolvedFields,
          },
        })

        return okStep(
          {
            dryRun: true,
            recordId,
            preview: {
              app_token: appToken,
              table_id: tableId,
              record_id: recordId,
              fields: resolvedFields,
            },
          },
          Date.now() - startTime,
        )
      }

      const res = await (client as any).bitable.v1.appTableRecord.update({
        path: {
          app_token: appToken,
          table_id: tableId,
          record_id: recordId,
        },
        data: {
          fields: resolvedFields,
        },
      })

      if (res?.code && res.code !== 0) {
        return errStep(
          'FEISHU_API_ERROR',
          res?.msg || 'Failed to update record',
          Date.now() - startTime,
          res,
        )
      }

      return okStep(
        {
          recordId,
        },
        Date.now() - startTime,
      )
    } catch (error: any) {
      return errStep(
        'PLUGIN_ERROR',
        `Failed to update record: ${error.message || error}`,
        Date.now() - startTime,
      )
    }
  }
}
