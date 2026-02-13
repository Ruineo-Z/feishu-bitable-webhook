import { IWorkflowPlugin, WorkflowContext, StepResult } from '../types'
import { client } from '../../client'
import { createLoggerWithTrace } from '../../logger'
import { CodecWarning, encodeFieldValueForWrite, FieldCodecError, formatCodecWarnings } from '../codec'
import { loadFieldResolverMaps, resolveFieldMeta } from './field-mapping-resolver'
import { extractFeishuErrorPayload } from './feishu-error'
import { okStep, errStep } from './step-result'
import { appendDryRunEffect, isDryRunContext } from './dry-run'

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

    const appToken = String(app_token)
    const tableId = String(table_id)

    try {
      const resolverMaps = await loadFieldResolverMaps(appToken, tableId)
      const sourceFields = fields as Record<string, unknown>
      const resolvedFields: Record<string, unknown> = {}
      const missingFieldIds: string[] = []
      const codecWarnings: CodecWarning[] = []

      for (const [fieldInput, fieldValue] of Object.entries(sourceFields)) {
        const resolved = resolveFieldMeta(fieldInput, resolverMaps)
        if (resolved.missing) {
          missingFieldIds.push(fieldInput)
          continue
        }

        const encoded = encodeFieldValueForWrite(fieldValue, {
          appToken,
          tableId,
          fieldName: resolved.fieldName,
          fieldId: resolved.fieldId,
          rawFieldType: resolved.fieldType,
        })
        resolvedFields[resolved.fieldName] = encoded.value
        codecWarnings.push(...encoded.warnings)
      }

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
          action: 'bitable.record.create',
          target: {
            app_token: appToken,
            table_id: tableId,
          },
          payload: {
            fields: resolvedFields,
          },
        })

        return okStep(
          {
            dryRun: true,
            preview: {
              app_token: appToken,
              table_id: tableId,
              fields: resolvedFields,
            },
            warnings: formatCodecWarnings(codecWarnings),
          },
          Date.now() - startTime,
        )
      }

      const res = await (client as any).bitable.v1.appTableRecord.create({
        path: {
          app_token: appToken,
          table_id: tableId,
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

      if (codecWarnings.length > 0) {
        const logger = createLoggerWithTrace(context.trigger?.traceId || 'WF-CODEC', 'bitable-create.ts')
        logger.warn('create 字段 codec 降级透传', formatCodecWarnings(codecWarnings))
      }

      return okStep(
        {
          recordId,
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
        return errStep(
          'FEISHU_API_ERROR',
          feishuError.msg || feishuError.message || 'Failed to create record',
          Date.now() - startTime,
          feishuError,
        )
      }

      return errStep(
        'PLUGIN_ERROR',
        `Failed to create record: ${error.message || error}`,
        Date.now() - startTime,
      )
    }
  }
}
