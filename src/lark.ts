import * as Lark from '@larksuiteoapi/node-sdk'
import { wsClient } from './client'
import { RuleMatcher, EventData } from './engine'
import { registerActions, executeActionWithTimeout } from './actions'
import { ExecutionLog } from './db/execution-logs'
import { bitablesDb } from './db/bitables'
import { fieldMappingsDb } from './db/field-mappings'
import { createEventTraceId, createFeishuLogger } from './logger'
import { parseFeishuEvent, ParsedEvent } from './parser'
import { getSupabase } from './db/client'
import { WorkflowEngine } from './workflow/core/engine'
import { registerStandardPlugins } from './workflow/plugins'
import { workflowsDb, summarizeWorkflowCandidateSources } from './db/workflows'

const ACTION_TIMEOUT_MS = 30000
const LEGACY_RULES_REALTIME_ENABLED = process.env.LEGACY_RULES_REALTIME_ENABLED === 'true'

registerStandardPlugins()
const workflowEngine = new WorkflowEngine()
const ruleMatcher = new RuleMatcher()

const processedEvents = new Set<string>()
const PROCESSED_EVENTS_TTL = 60 * 60 * 1000
const eventTimestamps = new Map<string, number>()

const logQueue: ExecutionLog[] = []
const LOG_QUEUE_MAX_SIZE = 1000
const LOG_FLUSH_INTERVAL = 5000

async function flushExecutionLogs(): Promise<void> {
  if (logQueue.length === 0) return

  const logs = logQueue.splice(0, logQueue.length)
  const log = createFeishuLogger('LOG')

  try {
    const { error } = await getSupabase()
      .from('execution_logs')
      .insert(logs)

    if (error) {
      log.error('批量写入执行日志失败:', error)
    }
  } catch (error) {
    log.error('批量写入执行日志异常:', error)
  }
}

function queueExecutionLog(executionLog: Omit<ExecutionLog, 'id' | 'created_at'>): void {
  if (logQueue.length >= LOG_QUEUE_MAX_SIZE) {
    logQueue.shift()
  }
  logQueue.push(executionLog as ExecutionLog)
}

setInterval(flushExecutionLogs, LOG_FLUSH_INTERVAL)

function logExecution(executionLog: Omit<ExecutionLog, 'id' | 'created_at'>): void {
  queueExecutionLog(executionLog)
}

function clearExpiredProcessedEvents(): void {
  const now = Date.now()
  for (const [id, ts] of eventTimestamps.entries()) {
    if (now - ts > PROCESSED_EVENTS_TTL) {
      processedEvents.delete(id)
      eventTimestamps.delete(id)
    }
  }
}

function normalizeTriggerAction(eventType: ParsedEvent['eventType']): string {
  if (eventType === 'record_created') return 'add'
  if (eventType === 'record_deleted') return 'remove'
  return eventType
}

async function mapFieldsByName(
  appToken: string,
  tableId: string,
  fieldsById: Record<string, unknown>,
): Promise<{ mappedFields: Record<string, unknown>; missingFieldIds: string[] }> {
  const idToNameMap = await fieldMappingsDb.getIdToNameMap(appToken, tableId)
  const mappedFields: Record<string, unknown> = {}
  const missingFieldIds: string[] = []

  for (const [fieldId, value] of Object.entries(fieldsById || {})) {
    const fieldName = idToNameMap[fieldId]
    if (fieldName) {
      mappedFields[fieldName] = value
      continue
    }

    mappedFields[fieldId] = value
    missingFieldIds.push(fieldId)
  }

  return { mappedFields, missingFieldIds }
}

function summarizeWorkflowResult(steps: Record<string, { success: boolean; error?: string; output?: unknown }>) {
  const stepEntries = Object.entries(steps)
  const failedEntry = stepEntries.find(([, result]) => !result.success)

  if (failedEntry) {
    return {
      status: 'failed' as const,
      errorMessage: failedEntry[1].error || `步骤 ${failedEntry[0]} 执行失败`,
    }
  }

  return {
    status: 'success' as const,
    errorMessage: null,
  }
}

async function executeLegacyRules(
  parsedEvent: ParsedEvent,
  traceId: string,
  log: ReturnType<typeof createFeishuLogger>,
): Promise<void> {
  const { appToken, tableId, recordId, operatorOpenId, fields, beforeFields } = parsedEvent

  const bitable = await bitablesDb.findByTable(appToken, tableId)
  if (!bitable) {
    log.warn(`[legacy] 未配置 bitable，跳过 rules 执行: app_token=${appToken}, table_id=${tableId}`)
    return
  }

  const eventData: EventData = {
    file_token: appToken,
    table_id: tableId,
    action_list: [{
      action: normalizeTriggerAction(parsedEvent.eventType),
      record_id: recordId,
    }],
    operator_id: operatorOpenId ? { open_id: operatorOpenId } : undefined,
    record: { fields, beforeFields },
  }

  const matchedRules = await ruleMatcher.match(eventData)
  if (matchedRules.length === 0) {
    log.info('[legacy] 无匹配规则')
    return
  }

  log.warn(`[legacy] 启用规则链路，命中 ${matchedRules.length} 条规则`)

  const fieldMappings = bitable.field_mappings as Record<string, string> || {}

  for (const { rule, recordId: matchedRecordId, matchedActions } of matchedRules) {
    const context = {
      recordId: matchedRecordId,
      record: fields,
      beforeRecord: beforeFields,
      operatorOpenId,
      action: eventData.action_list?.[0]?.action || 'unknown',
      traceId,
      field_mappings: fieldMappings,
    }

    for (const ruleAction of matchedActions) {
      const actionResult = await executeActionWithTimeout(ruleAction.action, context, ACTION_TIMEOUT_MS)

      logExecution({
        rule_id: rule.id!,
        rule_name: `${rule.name} - ${ruleAction.name}`,
        trigger_action: eventData.action_list?.[0]?.action || 'unknown',
        record_id: matchedRecordId,
        operator_openid: operatorOpenId || null,
        record_snapshot: { fields },
        status: actionResult.success ? 'success' : 'failed',
        error_message: actionResult.error || null,
        duration_ms: actionResult.durationMs,
        response: actionResult.response || null,
      })

      if (!actionResult.success && rule.on_failure === 'stop') {
        break
      }
    }
  }
}

async function processEvent(rawEvent: unknown, version: string) {
  const traceId = createEventTraceId()
  const log = createFeishuLogger(traceId)

  let parsedEvent: ParsedEvent
  try {
    parsedEvent = parseFeishuEvent(rawEvent)
  } catch (error) {
    log.error('解析事件失败:', error)
    return
  }

  const {
    eventId,
    eventType,
    appToken,
    tableId,
    recordId,
    operatorOpenId,
    fields,
    beforeFields,
  } = parsedEvent

  clearExpiredProcessedEvents()

  if (eventId && processedEvents.has(eventId)) {
    log.warn(`事件已处理: ${eventId}`)
    return
  }

  const mappedAfter = await mapFieldsByName(appToken, tableId, fields)
  const mappedBefore = await mapFieldsByName(appToken, tableId, beforeFields)

  const missingFieldIds = new Set<string>([
    ...mappedAfter.missingFieldIds,
    ...mappedBefore.missingFieldIds,
  ])
  if (missingFieldIds.size > 0) {
    log.warn('存在未映射字段 ID，已使用原始字段 ID 作为键:', Array.from(missingFieldIds))
  }

  const triggerAction = normalizeTriggerAction(eventType)

  try {
    const workflowCandidates = await workflowsDb.findCandidatesByScope(appToken, tableId)
    const sourceStats = summarizeWorkflowCandidateSources(workflowCandidates)

    if (workflowCandidates.length > 0) {
      log.info(`匹配到 ${workflowCandidates.length} 个工作流候选`, {
        sourceStats,
        eventType,
        version,
      })

      if (sourceStats['legacy-fallback'] > 0) {
        log.warn(`命中 ${sourceStats['legacy-fallback']} 个兼容兜底工作流，请尽快补齐 scope 字段`)
      }

      const executionResults = await Promise.allSettled(
        workflowCandidates.map(async ({ workflow, source }) => {
          const triggerContext = {
            record_id: recordId,
            app_token: appToken,
            table_id: tableId,
            record: {
              fields: mappedAfter.mappedFields,
              fields_by_id: fields,
              beforeFields: mappedBefore.mappedFields,
              before_fields_by_id: beforeFields,
            },
            action_list: [{ action: triggerAction }],
            operator_id: operatorOpenId ? { open_id: operatorOpenId } : undefined,
            traceId,
          }

          const workflowContext = await workflowEngine.execute(workflow.config, triggerContext)
          const summary = summarizeWorkflowResult(workflowContext.steps as Record<string, { success: boolean; error?: string; output?: unknown }>)

          logExecution({
            rule_id: workflow.id,
            rule_name: `workflow:${workflow.name}`,
            trigger_action: triggerAction,
            record_id: recordId,
            operator_openid: operatorOpenId || null,
            record_snapshot: {
              fields: mappedAfter.mappedFields,
              beforeFields: mappedBefore.mappedFields,
            },
            status: summary.status,
            error_message: summary.errorMessage,
            duration_ms: null,
            response: {
              workflowId: workflow.id,
              source,
              steps: workflowContext.steps,
            },
          })

          return {
            workflowId: workflow.id,
            workflowName: workflow.name,
            source,
            status: summary.status,
            error: summary.errorMessage,
          }
        }),
      )

      const failedExecutions = executionResults.filter((item) => item.status === 'rejected')
      if (failedExecutions.length > 0) {
        log.error(`工作流执行阶段发生 ${failedExecutions.length} 个异常`, failedExecutions)
      }
    } else {
      log.info('未命中任何工作流候选')
    }
  } catch (error) {
    log.error('工作流引擎处理异常:', error)
  }

  if (LEGACY_RULES_REALTIME_ENABLED) {
    try {
      await executeLegacyRules(parsedEvent, traceId, log)
    } catch (error) {
      log.error('legacy rules 执行异常:', error)
    }
  }

  if (eventId) {
    processedEvents.add(eventId)
    eventTimestamps.set(eventId, Date.now())
  }
}

async function processFieldChangedEvent(rawEvent: any) {
  const traceId = createEventTraceId()
  const log = createFeishuLogger(traceId)

  const appToken = rawEvent?.file_token
  const tableId = rawEvent?.table_id
  const actionItem = rawEvent?.action_list?.[0]
  const fieldId = actionItem?.field_id
  const beforeValue = actionItem?.before_value
  const afterValue = actionItem?.after_value
  const action = actionItem?.action

  log.info('字段变更解析:', {
    appToken,
    tableId,
    fieldId,
    before: beforeValue,
    after: afterValue,
    action,
  })

  if (!fieldId || !appToken || !tableId) {
    log.warn('字段变更事件缺少必要字段')
    return
  }

  const nextFieldName = afterValue?.name || afterValue?.field_name || afterValue?.text

  try {
    switch (action) {
      case 'add':
      case 'update':
      case 'field_edited':
      case 'field_added':
        if (typeof nextFieldName === 'string' && nextFieldName.trim().length > 0) {
          await fieldMappingsDb.upsertOne(appToken, tableId, fieldId, nextFieldName)
          log.info(`更新字段映射: ${fieldId} (${beforeValue?.name || '?'} -> ${nextFieldName})`)
        } else {
          log.warn(`字段变更事件缺少可用字段名，跳过写入: field_id=${fieldId}`)
        }
        break
      case 'delete':
      case 'field_deleted':
        await fieldMappingsDb.removeByFieldId(appToken, tableId, fieldId)
        log.info(`删除字段映射: ${fieldId}`)
        break
      default:
        log.warn(`未知的字段变更动作: ${action}`)
    }
  } catch (error) {
    log.error('处理字段变更事件失败:', error)
  }
}

export const startEventListener = async () => {
  const log = createFeishuLogger('START')

  try {
    if (LEGACY_RULES_REALTIME_ENABLED) {
      log.warn('LEGACY_RULES_REALTIME_ENABLED=true，旧 rules 链路将参与 realtime 处理（回滚模式）')
      registerActions()
    } else {
      log.info('workflow-only 模式已启用，旧 rules realtime 链路已关闭')
    }

    log.info('正在启动长连接...')

    wsClient.start({
      eventDispatcher: new Lark.EventDispatcher({}).register({
        'drive.file.bitable_record_changed_v1': async (data: any) => {
          processEvent(data, 'v1').catch((err) => {
            log.error('v1 事件异步处理失败:', err)
          })
        },
        'drive.file.bitable_record_changed_v2': async (data: any) => {
          processEvent(data, 'v2').catch((err) => {
            log.error('v2 事件异步处理失败:', err)
          })
        },
        'drive.file.bitable_field_changed_v1': async (data: any) => {
          processFieldChangedEvent(data).catch((err) => {
            log.error('字段变更事件处理失败:', err)
          })
        },
      }),
    })

    log.success('长连接事件监听已启动')
  } catch (error) {
    log.error('启动事件监听失败:', error)
    throw error
  }
}
