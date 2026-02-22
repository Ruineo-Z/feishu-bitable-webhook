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

const OWNER_FIELD_ALIASES = ['账号第一负责人', '第一负责人'] as const
const NICKNAME_FIELD_ALIASES = ['账号当前昵称', '当前昵称'] as const

const processedEvents = new Set<string>()
const processingEvents = new Set<string>()
const PROCESSED_EVENTS_TTL = 60 * 60 * 1000
const eventTimestamps = new Map<string, number>()
const processingEventTimestamps = new Map<string, number>()

type ExecutionLogInsert = Omit<ExecutionLog, 'id' | 'created_at'>
type WorkflowBusinessStatus = 'matched' | 'not_matched' | 'skipped' | 'unknown'

type PendingExecutionLog = {
  payload: ExecutionLogInsert
  retryCount: number
  enqueuedAt: number
}

type FlushExecutionLogOptions = {
  reason?: string
  force?: boolean
}

type FlushExecutionLogResult = {
  attempted: boolean
  success: boolean
  reason: string
  syncedCount: number
  requeuedCount: number
  droppedCount: number
  remainingQueueSize: number
  retryAfterMs: number | null
  errorMessage?: string
}

type DrainExecutionLogResult = {
  timedOut: boolean
  drainedCount: number
  attempts: number
  remainingQueueSize: number
  durationMs: number
}

type ExecutionLogWriter = (logs: ExecutionLogInsert[]) => Promise<void>

const logQueue: PendingExecutionLog[] = []
const LOG_QUEUE_MAX_SIZE = Math.max(Number(process.env.LOG_QUEUE_MAX_SIZE || 1000), 1)
const LOG_FLUSH_INTERVAL = Math.max(Number(process.env.LOG_FLUSH_INTERVAL_MS || 5000), 500)
const LOG_FLUSH_MAX_RETRIES = Math.max(Number(process.env.LOG_FLUSH_MAX_RETRIES || 5), 0)
const LOG_FLUSH_BACKOFF_BASE_MS = Math.max(Number(process.env.LOG_FLUSH_BACKOFF_BASE_MS || 500), 100)
const LOG_FLUSH_BACKOFF_MAX_MS = Math.max(Number(process.env.LOG_FLUSH_BACKOFF_MAX_MS || 30000), LOG_FLUSH_BACKOFF_BASE_MS)
const LOG_DRAIN_TIMEOUT_MS = Math.max(Number(process.env.LOG_DRAIN_TIMEOUT_MS || 5000), 500)
const LOG_DRAIN_RETRY_INTERVAL_MS = Math.max(Number(process.env.LOG_DRAIN_RETRY_INTERVAL_MS || 300), 50)

let isExecutionLogFlushInProgress = false
let nextFlushRetryAt = 0
let retryFlushTimer: ReturnType<typeof setTimeout> | null = null
let hasRegisteredDrainHooks = false
let isShutdownDraining = false

const defaultExecutionLogWriter: ExecutionLogWriter = async (logs) => {
  const { error } = await getSupabase()
    .from('execution_logs')
    .insert(logs)

  if (error) {
    throw error
  }
}

let executionLogWriter: ExecutionLogWriter = defaultExecutionLogWriter

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function getRetryDelayMs(retryCount: number): number {
  const exponential = LOG_FLUSH_BACKOFF_BASE_MS * (2 ** Math.max(retryCount - 1, 0))
  return Math.min(exponential, LOG_FLUSH_BACKOFF_MAX_MS)
}

function unwrapErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message || error.name
  }

  return String(error)
}

function getLogQueueDiagnostics() {
  const now = Date.now()
  const oldest = logQueue[0]
  const newest = logQueue[logQueue.length - 1]

  return {
    size: logQueue.length,
    maxSize: LOG_QUEUE_MAX_SIZE,
    oldestAgeMs: oldest ? now - oldest.enqueuedAt : 0,
    newestAgeMs: newest ? now - newest.enqueuedAt : 0,
  }
}

function enforceLogQueueLimit(log: ReturnType<typeof createFeishuLogger>, reason: 'enqueue' | 'requeue'): number {
  if (logQueue.length <= LOG_QUEUE_MAX_SIZE) {
    return 0
  }

  const overflow = logQueue.length - LOG_QUEUE_MAX_SIZE
  const dropped = logQueue.splice(0, overflow)
  const droppedSample = dropped[0]?.payload

  log.warn('执行日志队列达到上限，已按策略丢弃最旧日志', {
    reason,
    overflow,
    droppedCount: dropped.length,
    queueDiagnostics: getLogQueueDiagnostics(),
    droppedSample: droppedSample
      ? {
        workflow_id: droppedSample.workflow_id || null,
        rule_name: droppedSample.rule_name || null,
        record_id: droppedSample.record_id,
        trigger_action: droppedSample.trigger_action,
      }
      : null,
  })

  return dropped.length
}

function scheduleRetryFlush(delayMs: number): void {
  if (retryFlushTimer) {
    clearTimeout(retryFlushTimer)
  }

  retryFlushTimer = setTimeout(() => {
    retryFlushTimer = null
    void flushExecutionLogs({
      reason: 'retry',
    })
  }, delayMs)

  const timerHandle = retryFlushTimer as unknown as { unref?: () => void }
  if (typeof timerHandle.unref === 'function') {
    timerHandle.unref()
  }
}

async function flushExecutionLogs(options: FlushExecutionLogOptions = {}): Promise<FlushExecutionLogResult> {
  const reason = options.reason || 'interval'

  if (logQueue.length === 0) {
    return {
      attempted: false,
      success: true,
      reason,
      syncedCount: 0,
      requeuedCount: 0,
      droppedCount: 0,
      remainingQueueSize: 0,
      retryAfterMs: null,
    }
  }

  if (isExecutionLogFlushInProgress) {
    return {
      attempted: false,
      success: false,
      reason,
      syncedCount: 0,
      requeuedCount: 0,
      droppedCount: 0,
      remainingQueueSize: logQueue.length,
      retryAfterMs: null,
      errorMessage: 'flush_in_progress',
    }
  }

  if (!options.force && Date.now() < nextFlushRetryAt) {
    return {
      attempted: false,
      success: false,
      reason,
      syncedCount: 0,
      requeuedCount: 0,
      droppedCount: 0,
      remainingQueueSize: logQueue.length,
      retryAfterMs: nextFlushRetryAt - Date.now(),
      errorMessage: 'retry_window_not_reached',
    }
  }

  isExecutionLogFlushInProgress = true

  const batch = logQueue.splice(0, logQueue.length)
  const log = createFeishuLogger('LOG')
  const currentRetryCount = batch.reduce((max, item) => Math.max(max, item.retryCount), 0)

  try {
    await executionLogWriter(batch.map((item) => item.payload))
    nextFlushRetryAt = 0

    return {
      attempted: true,
      success: true,
      reason,
      syncedCount: batch.length,
      requeuedCount: 0,
      droppedCount: 0,
      remainingQueueSize: logQueue.length,
      retryAfterMs: null,
    }
  } catch (error) {
    const errorMessage = unwrapErrorMessage(error)
    const nextRetryCount = currentRetryCount + 1

    if (nextRetryCount > LOG_FLUSH_MAX_RETRIES) {
      nextFlushRetryAt = 0
      log.error('执行日志批量写入重试超限，丢弃当前批次', {
        reason,
        retryCount: nextRetryCount,
        maxRetries: LOG_FLUSH_MAX_RETRIES,
        batchSize: batch.length,
        queueDiagnostics: getLogQueueDiagnostics(),
        error: errorMessage,
      })

      return {
        attempted: true,
        success: false,
        reason,
        syncedCount: 0,
        requeuedCount: 0,
        droppedCount: batch.length,
        remainingQueueSize: logQueue.length,
        retryAfterMs: null,
        errorMessage,
      }
    }

    const requeuedBatch = batch.map((item) => ({
      ...item,
      retryCount: item.retryCount + 1,
    }))

    logQueue.unshift(...requeuedBatch)
    const droppedByQueueLimit = enforceLogQueueLimit(log, 'requeue')
    const retryAfterMs = getRetryDelayMs(nextRetryCount)
    nextFlushRetryAt = Date.now() + retryAfterMs

    if (!options.force) {
      scheduleRetryFlush(retryAfterMs)
    }

    log.warn('执行日志批量写入失败，已回队并等待退避重试', {
      reason,
      retryCount: nextRetryCount,
      retryAfterMs,
      batchSize: batch.length,
      droppedByQueueLimit,
      queueDiagnostics: getLogQueueDiagnostics(),
      error: errorMessage,
    })

    return {
      attempted: true,
      success: false,
      reason,
      syncedCount: 0,
      requeuedCount: Math.max(requeuedBatch.length - droppedByQueueLimit, 0),
      droppedCount: droppedByQueueLimit,
      remainingQueueSize: logQueue.length,
      retryAfterMs,
      errorMessage,
    }
  } finally {
    isExecutionLogFlushInProgress = false
  }
}

async function drainExecutionLogs(reason: string, timeoutMs = LOG_DRAIN_TIMEOUT_MS): Promise<DrainExecutionLogResult> {
  const log = createFeishuLogger('LOG')
  const startedAt = Date.now()
  let drainedCount = 0
  let attempts = 0

  while (logQueue.length > 0) {
    const elapsed = Date.now() - startedAt
    if (elapsed >= timeoutMs) {
      log.warn('执行日志 drain 超时，停止继续冲刷', {
        reason,
        timeoutMs,
        attempts,
        drainedCount,
        queueDiagnostics: getLogQueueDiagnostics(),
      })

      return {
        timedOut: true,
        drainedCount,
        attempts,
        remainingQueueSize: logQueue.length,
        durationMs: elapsed,
      }
    }

    attempts += 1
    const flushResult = await flushExecutionLogs({
      reason: `drain:${reason}`,
      force: true,
    })

    drainedCount += flushResult.syncedCount

    if (flushResult.success) {
      continue
    }

    const remainingBudgetMs = timeoutMs - (Date.now() - startedAt)
    if (remainingBudgetMs <= 0) {
      continue
    }

    const waitMs = Math.min(
      flushResult.retryAfterMs || LOG_DRAIN_RETRY_INTERVAL_MS,
      remainingBudgetMs,
    )
    await sleep(waitMs)
  }

  return {
    timedOut: false,
    drainedCount,
    attempts,
    remainingQueueSize: 0,
    durationMs: Date.now() - startedAt,
  }
}

async function handleShutdownDrain(signal: 'SIGINT' | 'SIGTERM'): Promise<void> {
  if (isShutdownDraining) {
    return
  }
  isShutdownDraining = true

  const log = createFeishuLogger('LOG')
  log.warn('收到退出信号，开始冲刷执行日志', {
    signal,
    queueDiagnostics: getLogQueueDiagnostics(),
    drainTimeoutMs: LOG_DRAIN_TIMEOUT_MS,
  })

  try {
    const result = await drainExecutionLogs(signal, LOG_DRAIN_TIMEOUT_MS)
    if (result.timedOut) {
      log.warn('退出前执行日志冲刷超时', {
        signal,
        ...result,
      })
    } else {
      log.info('退出前执行日志冲刷完成', {
        signal,
        ...result,
      })
    }
  } catch (error) {
    log.error('退出前执行日志冲刷异常', {
      signal,
      error: unwrapErrorMessage(error),
    })
  } finally {
    process.exit(0)
  }
}

function registerExecutionLogDrainHandlers(): void {
  if (hasRegisteredDrainHooks) {
    return
  }

  hasRegisteredDrainHooks = true
  const log = createFeishuLogger('LOG')

  process.once('SIGINT', () => {
    void handleShutdownDrain('SIGINT')
  })
  process.once('SIGTERM', () => {
    void handleShutdownDrain('SIGTERM')
  })
  process.once('beforeExit', () => {
    void drainExecutionLogs('beforeExit', LOG_DRAIN_TIMEOUT_MS).catch((error) => {
      log.error('beforeExit 执行日志冲刷失败', {
        error: unwrapErrorMessage(error),
      })
    })
  })
}

const flushInterval = setInterval(() => {
  void flushExecutionLogs({
    reason: 'interval',
  })
}, LOG_FLUSH_INTERVAL)

const flushIntervalHandle = flushInterval as unknown as { unref?: () => void }
if (typeof flushIntervalHandle.unref === 'function') {
  flushIntervalHandle.unref()
}

function queueExecutionLog(executionLog: ExecutionLogInsert): void {
  const log = createFeishuLogger('LOG')
  logQueue.push({
    payload: executionLog,
    retryCount: 0,
    enqueuedAt: Date.now(),
  })
  enforceLogQueueLimit(log, 'enqueue')
}

function logExecution(executionLog: ExecutionLogInsert): void {
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
): Promise<{
  mappedFields: Record<string, unknown>
  missingFieldIds: string[]
  warnings: ReturnType<typeof formatCodecWarnings>
  fieldTypesById: Record<string, string>
  fieldTypesByName: Record<string, string>
  idToNameMap: Record<string, string>
}> {
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

  const fieldTypesByName = {
    ...fieldTypeMaps.fieldTypeByName,
  }
  for (const [fieldId, fieldName] of Object.entries(idToNameMap)) {
    const typeById = fieldTypeMaps.fieldTypeById[fieldId]
    if (typeById && !fieldTypesByName[fieldName]) {
      fieldTypesByName[fieldName] = typeById
    }
  }

  return {
    mappedFields,
    missingFieldIds,
    warnings: formatCodecWarnings(codecWarnings),
    fieldTypesById: {
      ...fieldTypeMaps.fieldTypeById,
    },
    fieldTypesByName,
    idToNameMap,
  }
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

function summarizeWorkflowBusinessStatus(
  steps: Record<string, { success: boolean; skipped?: boolean; output?: unknown }>,
): WorkflowBusinessStatus {
  const stepResults = Object.values(steps || {})
  if (stepResults.length === 0) {
    return 'unknown'
  }

  if (stepResults.some((step) => step.skipped)) {
    return 'skipped'
  }

  const hasConditionNotMatched = stepResults.some((step) => {
    const output = step.output as Record<string, unknown> | undefined
    const data = output?.data as Record<string, unknown> | undefined
    return data?.pass === false
  })

  if (hasConditionNotMatched) {
    return 'not_matched'
  }

  if (stepResults.every((step) => step.success)) {
    return 'matched'
  }

  return 'unknown'
}

function summarizeExecutionError(error: unknown): { name: string; message: string; stack?: string } {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message || 'unknown_error',
      stack: error.stack,
    }
  }

  return {
    name: 'UnknownError',
    message: String(error),
  }
}

function queueRejectedWorkflowExecutionLog(params: {
  workflowId: string
  workflowName: string
  source: string
  triggerAction: string
  recordId: string
  operatorOpenId: string | null
  fieldsAfter: Record<string, unknown>
  fieldsBefore: Record<string, unknown>
  routedEventType: WorkflowEventType
  traceId: string
  error: unknown
}) {
  const errorSummary = summarizeExecutionError(params.error)

  logExecution({
    workflow_id: params.workflowId,
    rule_id: null,
    rule_name: `workflow:${params.workflowName}`,
    trigger_action: params.triggerAction,
    record_id: params.recordId,
    operator_openid: params.operatorOpenId,
    record_snapshot: {
      fields: params.fieldsAfter,
      beforeFields: params.fieldsBefore,
    },
    status: 'failed',
    error_message: errorSummary.message,
    duration_ms: null,
    response: {
      workflowId: params.workflowId,
      source: params.source,
      routedEventType: params.routedEventType,
      business_status: 'unknown' as const,
      traceId: params.traceId,
      trigger_action: params.triggerAction,
      error: errorSummary,
    },
  })

  return errorSummary
}

function summarizeStepStats(steps: Record<string, { success: boolean; skipped?: boolean }>) {
  const values = Object.values(steps)
  return {
    total: values.length,
    success: values.filter((step) => step.success && !step.skipped).length,
    skipped: values.filter((step) => step.skipped).length,
    failed: values.filter((step) => !step.success).length,
  }
}

function extractUserIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  const ids = value
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const record = item as Record<string, unknown>
      if (typeof record.id === 'string' && record.id) return record.id
      if (typeof record.open_id === 'string' && record.open_id) return record.open_id
      if (typeof record.user_id === 'string' && record.user_id) return record.user_id
      if (typeof record.userId === 'string' && record.userId) return record.userId
      return null
    })
    .filter((item): item is string => Boolean(item))

  return Array.from(new Set(ids))
}

function normalizeRawUserId(user: unknown): string | null {
  if (!user || typeof user !== 'object') {
    return null
  }

  const record = user as Record<string, unknown>
  const nestedUserId = record.user_id

  if (nestedUserId && typeof nestedUserId === 'object') {
    const nested = nestedUserId as Record<string, unknown>
    if (typeof nested.open_id === 'string' && nested.open_id) return nested.open_id
    if (typeof nested.user_id === 'string' && nested.user_id) return nested.user_id
    if (typeof nested.union_id === 'string' && nested.union_id) return nested.union_id
  }

  if (typeof record.id === 'string' && record.id) return record.id
  if (typeof record.open_id === 'string' && record.open_id) return record.open_id
  if (typeof record.user_id === 'string' && record.user_id) return record.user_id
  if (typeof record.userId === 'string' && record.userId) return record.userId

  return null
}

function normalizeRawUserName(user: unknown): string | null {
  if (!user || typeof user !== 'object') {
    return null
  }

  const record = user as Record<string, unknown>
  if (typeof record.name === 'string' && record.name.trim().length > 0) return record.name.trim()
  if (typeof record.enName === 'string' && record.enName.trim().length > 0) return record.enName.trim()
  if (typeof record.user_name === 'string' && record.user_name.trim().length > 0) return record.user_name.trim()
  if (typeof record.display_name === 'string' && record.display_name.trim().length > 0) return record.display_name.trim()

  return null
}

function buildUserNameIndexFromRawEvent(rawEvent: unknown): Map<string, string> {
  const index = new Map<string, string>()
  const event = (rawEvent || {}) as Record<string, unknown>
  const actionList = Array.isArray(event.action_list) ? event.action_list : []

  for (const action of actionList) {
    if (!action || typeof action !== 'object') continue
    const actionObj = action as Record<string, unknown>

    for (const key of ['before_value', 'after_value'] as const) {
      const values = actionObj[key]
      if (!Array.isArray(values)) continue

      for (const item of values) {
        if (!item || typeof item !== 'object') continue
        const itemObj = item as Record<string, unknown>
        const identityValue = itemObj.field_identity_value
        if (!identityValue || typeof identityValue !== 'object') continue

        const users = (identityValue as Record<string, unknown>).users
        if (!Array.isArray(users)) continue

        for (const user of users) {
          const id = normalizeRawUserId(user)
          const name = normalizeRawUserName(user)
          if (!id || !name || index.has(id)) continue
          index.set(id, name)
        }
      }
    }
  }

  return index
}

function toSummaryText(value: unknown, userNameIndex?: Map<string, string>): string {
  if (value === null || value === undefined || value === '') {
    return '空'
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return '空'
    const ids = extractUserIds(value)
    if (ids.length > 0) {
      return ids
        .map((id) => {
          const userName = userNameIndex?.get(id)
          return userName ? `${userName} (${id})` : id
        })
        .join(', ')
    }

    const compact = value
      .map((item) => {
        if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
          return String(item)
        }
        try {
          return JSON.stringify(item)
        } catch {
          return String(item)
        }
      })
      .filter((item) => item.length > 0)
      .join(', ')

    return compact || '空'
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function hasChanged(beforeValue: unknown, afterValue: unknown): boolean {
  try {
    return JSON.stringify(beforeValue) !== JSON.stringify(afterValue)
  } catch {
    return String(beforeValue) !== String(afterValue)
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

function pickDiagnosticsField(snapshot: Record<string, unknown>, fieldNames: string | readonly string[]) {
  const candidates = Array.isArray(fieldNames) ? fieldNames : [fieldNames]

  for (const fieldName of candidates) {
    if (!(fieldName in snapshot)) {
      continue
    }

    return snapshot[fieldName]
  }

  return null
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
    const userNameIndex = buildUserNameIndexFromRawEvent(rawEvent)
    const fieldTypesById = {
      ...mappedBefore.fieldTypesById,
      ...mappedAfter.fieldTypesById,
    }
    const fieldTypesByName = {
      ...mappedBefore.fieldTypesByName,
      ...mappedAfter.fieldTypesByName,
    }
    const fieldIdToName = {
      ...mappedBefore.idToNameMap,
      ...mappedAfter.idToNameMap,
    }

    const ownerBefore = pickDiagnosticsField(mappedBefore.mappedFields, OWNER_FIELD_ALIASES)
    const ownerAfter = pickDiagnosticsField(mappedAfter.mappedFields, OWNER_FIELD_ALIASES)
    const nicknameBefore = pickDiagnosticsField(mappedBefore.mappedFields, NICKNAME_FIELD_ALIASES)
    const nicknameAfter = pickDiagnosticsField(mappedAfter.mappedFields, NICKNAME_FIELD_ALIASES)

    log.debug('关键字段快照', {
      eventId,
      eventType,
      recordId,
      ownerBefore,
      ownerAfter,
      nicknameBefore,
      nicknameAfter,
    })

    log.info('事件业务摘要', {
      eventId,
      eventType,
      recordId,
      ownerChanged: hasChanged(ownerBefore, ownerAfter),
      ownerBefore: toSummaryText(ownerBefore, userNameIndex),
      ownerAfter: toSummaryText(ownerAfter, userNameIndex),
      nicknameChanged: hasChanged(nicknameBefore, nicknameAfter),
      nicknameBefore: toSummaryText(nicknameBefore),
      nicknameAfter: toSummaryText(nicknameAfter),
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
                fieldTypes: fieldTypesByName,
                fieldTypesByName: fieldTypesByName,
                field_types_by_name: fieldTypesByName,
                fieldTypesById: fieldTypesById,
                field_types_by_id: fieldTypesById,
                fieldIdToName: fieldIdToName,
                field_id_to_name: fieldIdToName,
              },
              action_list: [{ action: triggerAction }],
              operator_id: operatorOpenId ? { open_id: operatorOpenId } : undefined,
              traceId,
            }

            const workflowContext = await workflowEngine.execute(workflow.config, triggerContext)
            const summary = summarizeWorkflowResult(workflowContext.steps as Record<string, { success: boolean; error?: string; output?: unknown }>)
            const stepStats = summarizeStepStats(workflowContext.steps as Record<string, { success: boolean; skipped?: boolean }>)
            const businessStatus = summarizeWorkflowBusinessStatus(workflowContext.steps as Record<string, { success: boolean; skipped?: boolean; output?: unknown }>)

            logExecution({
              workflow_id: workflow.id,
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
                business_status: businessStatus,
                steps: workflowContext.steps,
              },
            })

            return {
              workflowId: workflow.id,
              workflowName: workflow.name,
              source,
              status: summary.status,
              error: summary.errorMessage,
              businessStatus,
              stepStats,
            }
          }),
        )

        const fulfilledExecutions = executionResults
          .filter((item): item is PromiseFulfilledResult<{
            workflowId: string
            workflowName: string
            source: string
            status: 'success' | 'failed'
            error: string | null
            businessStatus: WorkflowBusinessStatus
            stepStats: {
              total: number
              success: number
              skipped: number
              failed: number
            }
          }> => item.status === 'fulfilled')
          .map((item) => item.value)

        const executionSummary = fulfilledExecutions.reduce(
          (acc, item) => {
            if (item.status === 'success') {
              acc.workflowSuccess += 1
            } else {
              acc.workflowFailed += 1
            }

            acc.stepTotal += item.stepStats.total
            acc.stepSuccess += item.stepStats.success
            acc.stepSkipped += item.stepStats.skipped
            acc.stepFailed += item.stepStats.failed

            return acc
          },
          {
            workflowSuccess: 0,
            workflowFailed: 0,
            stepTotal: 0,
            stepSuccess: 0,
            stepSkipped: 0,
            stepFailed: 0,
          },
        )

        const failedExecutions = executionResults
          .map((item, index) => ({
            item,
            candidate: executableWorkflows[index],
          }))
          .filter((entry): entry is {
            item: PromiseRejectedResult
            candidate: (typeof executableWorkflows)[number]
          } => entry.item.status === 'rejected')

        if (failedExecutions.length > 0) {
          const exceptionSummaries = failedExecutions.map((entry) => {
            const errorSummary = queueRejectedWorkflowExecutionLog({
              workflowId: entry.candidate.workflow.id,
              workflowName: entry.candidate.workflow.name,
              source: entry.candidate.source,
              triggerAction,
              recordId,
              operatorOpenId: operatorOpenId || null,
              fieldsAfter: mappedAfter.mappedFields,
              fieldsBefore: mappedBefore.mappedFields,
              routedEventType: normalizedEventType,
              traceId,
              error: entry.item.reason,
            })

            return {
              workflowId: entry.candidate.workflow.id,
              workflowName: entry.candidate.workflow.name,
              source: entry.candidate.source,
              error: errorSummary,
            }
          })

          log.error(`工作流执行阶段发生 ${failedExecutions.length} 个异常`, exceptionSummaries)
        }

        log.info('工作流执行摘要', {
          eventId,
          eventType,
          recordId,
          workflowTotal: executableWorkflows.length,
          workflowSuccess: executionSummary.workflowSuccess,
          workflowFailed: executionSummary.workflowFailed,
          workflowExceptions: failedExecutions.length,
          stepTotal: executionSummary.stepTotal,
          stepSuccess: executionSummary.stepSuccess,
          stepSkipped: executionSummary.stepSkipped,
          stepFailed: executionSummary.stepFailed,
        })
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
    registerExecutionLogDrainHandlers()

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

export const __testing = {
  queueExecutionLog,
  flushExecutionLogs,
  drainExecutionLogs,
  summarizeWorkflowBusinessStatus,
  queueRejectedWorkflowExecutionLog,
  setExecutionLogWriter(writer: ExecutionLogWriter | null) {
    executionLogWriter = writer || defaultExecutionLogWriter
  },
  resetExecutionLogQueue() {
    logQueue.splice(0, logQueue.length)
    nextFlushRetryAt = 0
    if (retryFlushTimer) {
      clearTimeout(retryFlushTimer)
      retryFlushTimer = null
    }
    isExecutionLogFlushInProgress = false
    isShutdownDraining = false
  },
  getLogQueueDiagnostics,
  registerExecutionLogDrainHandlers,
}
