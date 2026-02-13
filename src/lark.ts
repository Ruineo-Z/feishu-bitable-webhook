import * as Lark from '@larksuiteoapi/node-sdk'
import { wsClient } from './client'
import { ExecutionLog } from './db/execution-logs'
import { fieldMappingsDb } from './db/field-mappings'
import { createEventTraceId, createFeishuLogger, createLoggerWithTrace } from './logger'
import { parseFeishuEvent, ParsedEvent } from './parser'
import { getSupabase } from './db/client'
import { WorkflowEngine } from './workflow/core/engine'
import { WorkflowConfig } from './workflow/types'
import { decodeFieldValue, formatCodecWarnings } from './workflow/codec'
import {
  WorkflowEventType,
  normalizeWorkflowEventType,
  resolveWorkflowEventTypes,
} from './workflow/scope'
import { registerStandardPlugins } from './workflow/plugins'
import { workflowsDb, summarizeWorkflowCandidateSources } from './db/workflows'

registerStandardPlugins()
const workflowEngine = new WorkflowEngine()

const processedEvents = new Set<string>()
const processingEvents = new Set<string>()
const PROCESSED_EVENTS_TTL = 60 * 60 * 1000
const eventTimestamps = new Map<string, number>()
const processingEventTimestamps = new Map<string, number>()

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

function clearExpiredEventStates(): void {
  const now = Date.now()
  for (const [id, ts] of eventTimestamps.entries()) {
    if (now - ts > PROCESSED_EVENTS_TTL) {
      processedEvents.delete(id)
      eventTimestamps.delete(id)
    }
  }

  for (const [id, ts] of processingEventTimestamps.entries()) {
    if (now - ts > PROCESSED_EVENTS_TTL) {
      processingEvents.delete(id)
      processingEventTimestamps.delete(id)
    }
  }
}

function normalizeTriggerAction(eventType: ParsedEvent['eventType']): string {
  if (eventType === 'record_created') return 'add'
  if (eventType === 'record_deleted') return 'remove'
  return eventType
}

function shouldRunWorkflowForEvent(
  workflowConfig: WorkflowConfig | null | undefined,
  currentEventType: ParsedEvent['eventType'],
): boolean {
  const resolved = resolveWorkflowEventTypes({ config: workflowConfig })
  if (!resolved.eventTypes || resolved.eventTypes.length === 0) {
    return true
  }

  return resolved.eventTypes.includes(currentEventType)
}

async function mapFieldsByName(
  appToken: string,
  tableId: string,
  fieldsById: Record<string, unknown>,
  traceId = 'WF-MAP',
): Promise<{ mappedFields: Record<string, unknown>; missingFieldIds: string[]; warnings: ReturnType<typeof formatCodecWarnings> }> {
  const mapLog = createLoggerWithTrace(traceId, 'lark.ts')

  let idToNameMap: Record<string, string> = {}
  try {
    idToNameMap = await fieldMappingsDb.getIdToNameMap(appToken, tableId)
  } catch (error) {
    mapLog.warn('获取字段映射失败，降级使用 field_id 作为键', {
      appToken,
      tableId,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  let fieldTypeMaps: {
    fieldTypeById: Record<string, string>
    fieldTypeByName: Record<string, string>
  } = {
    fieldTypeById: {},
    fieldTypeByName: {},
  }

  try {
    const result = await fieldMappingsDb.getFieldTypeMaps(appToken, tableId)
    fieldTypeMaps = {
      fieldTypeById: result.fieldTypeById,
      fieldTypeByName: result.fieldTypeByName,
    }
  } catch (error) {
    mapLog.warn('获取字段类型失败，降级 unknown', {
      appToken,
      tableId,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  const mappedFields: Record<string, unknown> = {}
  const missingFieldIds: string[] = []
  const codecWarnings = []

  for (const [fieldId, value] of Object.entries(fieldsById || {})) {
    const fieldName = idToNameMap[fieldId]
    if (fieldName) {
      const decoded = decodeFieldValue(value, {
        appToken,
        tableId,
        fieldName,
        fieldId,
        rawFieldType: fieldTypeMaps.fieldTypeById[fieldId] || fieldTypeMaps.fieldTypeByName[fieldName] || 'unknown',
      })
      mappedFields[fieldName] = decoded.value
      codecWarnings.push(...decoded.warnings)
      continue
    }

    mappedFields[fieldId] = value
    missingFieldIds.push(fieldId)
  }

  return { mappedFields, missingFieldIds, warnings: formatCodecWarnings(codecWarnings) }
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

function previewRawValue(value: unknown, maxLen = 120): string | null {
  if (value === undefined || value === null) return null
  const str = String(value)
  return str.length > maxLen ? `${str.slice(0, maxLen)}...` : str
}

type RawFieldChangeSummary = {
  fieldId: string
  beforeHasValue: boolean
  afterHasValue: boolean
  beforeUserCount: number
  afterUserCount: number
  beforeValuePreview: string | null
  afterValuePreview: string | null
}

function summarizeRawFieldChanges(
  beforeValue: Array<Record<string, unknown>> | undefined,
  afterValue: Array<Record<string, unknown>> | undefined,
): RawFieldChangeSummary[] {
  const byFieldId = new Map<string, RawFieldChangeSummary>()

  const fill = (
    list: Array<Record<string, unknown>> | undefined,
    type: 'before' | 'after',
  ) => {
    for (const item of list || []) {
      const fieldId = typeof item.field_id === 'string' ? item.field_id : 'unknown_field'
      if (!byFieldId.has(fieldId)) {
        byFieldId.set(fieldId, {
          fieldId,
          beforeHasValue: false,
          afterHasValue: false,
          beforeUserCount: 0,
          afterUserCount: 0,
          beforeValuePreview: null,
          afterValuePreview: null,
        })
      }

      const snapshot = byFieldId.get(fieldId)!
      const identity = item.field_identity_value as Record<string, unknown> | undefined
      const users = Array.isArray(identity?.users) ? identity?.users : []
      const hasValue = item.field_value !== undefined && item.field_value !== null && item.field_value !== ''
      const valuePreview = previewRawValue(item.field_value)

      if (type === 'before') {
        snapshot.beforeHasValue = hasValue || users.length > 0
        snapshot.beforeUserCount = users.length
        snapshot.beforeValuePreview = valuePreview
      } else {
        snapshot.afterHasValue = hasValue || users.length > 0
        snapshot.afterUserCount = users.length
        snapshot.afterValuePreview = valuePreview
      }
    }
  }

  fill(beforeValue, 'before')
  fill(afterValue, 'after')

  return Array.from(byFieldId.values())
}

function summarizeRawEvent(rawEvent: unknown) {
  const event = (rawEvent || {}) as Record<string, unknown>
  const actionList = Array.isArray(event.action_list) ? event.action_list : []

  return {
    eventId: event.event_id,
    eventType: event.event_type,
    createTime: event.create_time,
    tableId: event.table_id,
    appToken: event.file_token,
    actionCount: actionList.length,
    actions: actionList.map((action) => {
      const actionObj = action as Record<string, unknown>
      const beforeValue = Array.isArray(actionObj.before_value) ? actionObj.before_value as Array<Record<string, unknown>> : []
      const afterValue = Array.isArray(actionObj.after_value) ? actionObj.after_value as Array<Record<string, unknown>> : []

      return {
        action: actionObj.action,
        recordId: actionObj.record_id,
        beforeFieldCount: beforeValue.length,
        afterFieldCount: afterValue.length,
        fieldChanges: summarizeRawFieldChanges(beforeValue, afterValue),
      }
    }),
  }
}

function pickDiagnosticsField(snapshot: Record<string, unknown>, fieldName: string) {
  if (!(fieldName in snapshot)) {
    return null
  }
  return snapshot[fieldName]
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

  log.debug('原始事件摘要', summarizeRawEvent(rawEvent))

  clearExpiredEventStates()

  if (eventId && processedEvents.has(eventId)) {
    log.warn(`事件已处理: ${eventId}`)
    return
  }

  if (eventId && processingEvents.has(eventId)) {
    log.warn(`事件正在处理中，跳过重复投递: ${eventId}`)
    return
  }

  if (eventId) {
    processingEvents.add(eventId)
    processingEventTimestamps.set(eventId, Date.now())
  }

  let shouldMarkProcessed = false
  try {
    const mappedAfter = await mapFieldsByName(appToken, tableId, fields, traceId)
    const mappedBefore = await mapFieldsByName(appToken, tableId, beforeFields, traceId)

    log.debug('关键字段快照', {
      eventId,
      eventType,
      recordId,
      ownerBefore: pickDiagnosticsField(mappedBefore.mappedFields, '账号第一负责人'),
      ownerAfter: pickDiagnosticsField(mappedAfter.mappedFields, '账号第一负责人'),
      nicknameBefore: pickDiagnosticsField(mappedBefore.mappedFields, '账号当前昵称'),
      nicknameAfter: pickDiagnosticsField(mappedAfter.mappedFields, '账号当前昵称'),
    })

    const missingFieldIds = new Set<string>([
      ...mappedAfter.missingFieldIds,
      ...mappedBefore.missingFieldIds,
    ])
    if (missingFieldIds.size > 0) {
      log.warn('存在未映射字段 ID，已使用原始字段 ID 作为键:', Array.from(missingFieldIds))
    }
    const codecWarnings = [...mappedAfter.warnings, ...mappedBefore.warnings]
    if (codecWarnings.length > 0) {
      log.warn('事件字段 decode 命中 codec 降级透传', codecWarnings)
    }

    const triggerAction = normalizeTriggerAction(eventType)
    const normalizedEventType: WorkflowEventType = normalizeWorkflowEventType(eventType) || eventType

    shouldMarkProcessed = true

    const workflowCandidates = await workflowsDb.findCandidatesByScope(appToken, tableId, normalizedEventType)
    const sourceStats = summarizeWorkflowCandidateSources(workflowCandidates)

    if (workflowCandidates.length > 0) {
      const executableWorkflows = workflowCandidates.filter(({ workflow }) =>
        shouldRunWorkflowForEvent(workflow.config, eventType),
      )

      const skippedByEventType = workflowCandidates.length - executableWorkflows.length

      log.info(`匹配到 ${workflowCandidates.length} 个工作流候选`, {
        sourceStats,
        eventType,
        version,
        routedCandidates: workflowCandidates.length,
        executableCandidates: executableWorkflows.length,
        skippedByEventType,
      })

      if (skippedByEventType > 0) {
        log.warn('存在候选工作流在运行时 eventTypes 兜底过滤中被跳过，建议检查 trigger_actions 回填一致性', {
          eventType,
          skippedByEventType,
        })
      }

      if (executableWorkflows.length === 0) {
        log.info('候选工作流与当前事件类型不匹配，跳过执行')
      } else {
        const executionResults = await Promise.allSettled(
          executableWorkflows.map(async ({ workflow, source }) => {
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
              rule_id: null,
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
                routedEventType: normalizedEventType,
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
      }
    } else {
      log.debug('未命中任何工作流候选', {
        eventId,
        eventType,
        version,
        appToken,
        tableId,
        recordId,
      })
    }
  } catch (error) {
    log.error('工作流引擎处理异常', {
      eventId,
      eventType,
      appToken,
      tableId,
      recordId,
      error,
    })
  } finally {
    if (eventId) {
      processingEvents.delete(eventId)
      processingEventTimestamps.delete(eventId)
      if (shouldMarkProcessed) {
        processedEvents.add(eventId)
        eventTimestamps.set(eventId, Date.now())
      }
    }
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
    log.info('workflow-only 模式已启用')

    log.info('正在启动长连接...')

    wsClient.start({
      eventDispatcher: new Lark.EventDispatcher({}).register({
        'drive.file.bitable_record_changed_v1': (data: any) => {
          void processEvent(data, 'v1').catch((err) => {
            log.error('v1 事件异步处理失败:', err)
          })
        },
        'drive.file.bitable_record_changed_v2': (data: any) => {
          void processEvent(data, 'v2').catch((err) => {
            log.error('v2 事件异步处理失败:', err)
          })
        },
        'drive.file.bitable_field_changed_v1': (data: any) => {
          void processFieldChangedEvent(data).catch((err) => {
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
