import { config } from 'dotenv'
import * as Lark from '@larksuiteoapi/node-sdk'
import { RuleMatcher, EventData, MatchedRule } from './engine'
import { executeAction, registerActions } from './actions'
import { executionLogsDb, ExecutionLog } from './db/execution-logs'
import { bitablesDb } from './db/bitables'
import { logger } from './logger'

config()

const baseConfig = {
  appId: process.env.FEISHU_APP_ID || '',
  appSecret: process.env.FEISHU_APP_SECRET || '',
}

const client = new Lark.Client({
  ...baseConfig,
  loggerLevel: Lark.LoggerLevel.info,
})

const wsClient = new Lark.WSClient({
  ...baseConfig,
  loggerLevel: Lark.LoggerLevel.info,
})

const ruleMatcher = new RuleMatcher()

const processedEvents = new Set<string>()
const PROCESSED_EVENTS_TTL = 60 * 60 * 1000
const eventTimestamps = new Map<string, number>()

function parseFieldValue(fieldValue: string): unknown {
  if (!fieldValue) return null
  try {
    return JSON.parse(fieldValue)
  } catch {
    return fieldValue
  }
}

function extractFieldsFromAction(
  actionData: any,
  fieldMappings: Record<string, string> = {}
): { after: Record<string, unknown>; before: Record<string, unknown> } {
  const after: Record<string, unknown> = {}
  const before: Record<string, unknown> = {}

  function parseFieldWithIdentity(item: any): unknown {
    if (item.field_identity_value?.users?.length > 0) {
      const users = item.field_identity_value.users.map((u: any) => ({
        id: u.user_id?.open_id
      }))
      return users
    }
    if (item.field_value === '' || !item.field_value) {
      return null
    }
    return parseFieldValue(item.field_value)
  }

  if (actionData?.after_value) {
    for (const item of actionData.after_value) {
      const value = parseFieldWithIdentity(item)
      after[item.field_id] = value
      const mappedName = fieldMappings[item.field_id]
      if (mappedName) {
        after[mappedName] = value
      }
    }
  }

  if (actionData?.before_value) {
    for (const item of actionData.before_value) {
      const value = parseFieldWithIdentity(item)
      before[item.field_id] = value
      const mappedName = fieldMappings[item.field_id]
      if (mappedName) {
        before[mappedName] = value
      }
    }
  }

  return { after, before }
}

async function logExecution(log: Omit<ExecutionLog, 'id' | 'created_at'>): Promise<void> {
  try {
    await executionLogsDb.create(log)
  } catch (error) {
    logger.error('[飞书] 写入执行日志失败:', error)
  }
}

async function validateConnections(): Promise<void> {
  logger.info('[飞书] 验证多维表格连接配置...')
  const bitables = await bitablesDb.findAll()
  logger.info(`[飞书] 已配置 ${bitables.length} 个多维表格`)
  for (const bitable of bitables) {
    logger.info(`[飞书] - ${bitable.name}: ${bitable.app_token}`)
  }
}

async function processEvent(data: any, version: string) {
  const eventId = data.event_id

  const now = Date.now()
  for (const [id, timestamp] of eventTimestamps.entries()) {
    if (now - timestamp > PROCESSED_EVENTS_TTL) {
      processedEvents.delete(id)
      eventTimestamps.delete(id)
    }
  }

  if (eventId && processedEvents.has(eventId)) {
    logger.warn(`[飞书] 事件 ${eventId} 已处理过，跳过`)
    return
  }

  logger.info('[飞书] 收到事件完整内容:', JSON.stringify(data, null, 2))

  const eventData: EventData = {
    file_token: data.file_token,
    table_id: data.table_id,
    action_list: data.action_list,
    operator_id: data.operator_id,
  }

  const actionData = data.action_list?.[0]
  logger.info(`[飞书] 收到 ${version} 事件:`, {
    action: actionData?.action,
    tableId: data.table_id,
    recordId: actionData?.record_id,
    operatorId: data.operator_id?.open_id,
  })
  logger.info(`[飞书] 触发: 记录=${actionData?.record_id}, 操作=${actionData?.action}`)

  try {
    const recordId = actionData?.record_id

    let fieldMappings: Record<string, string> = {}
    try {
      const bitable = await bitablesDb.findByAppToken(data.file_token)
      if (bitable?.field_mappings) {
        fieldMappings = bitable.field_mappings as Record<string, string>
      }
    } catch (e) {
      logger.warn('[飞书] 获取字段映射失败，使用默认映射')
    }

    const { after: fields, before: beforeFields } = extractFieldsFromAction(actionData, fieldMappings)
    ;(eventData as any).record = { fields, beforeFields }

    const matchedRules = await ruleMatcher.match(eventData)

    if (matchedRules.length === 0) {
      logger.info('[飞书] 无匹配规则')
      return
    }

    logger.info('[飞书] 匹配规则: ' + matchedRules.map(r => r.rule.name).join(', '))

    for (const { rule, recordId, matchedActions } of matchedRules) {
      const context = {
        recordId,
        record: fields,
        beforeRecord: beforeFields,
        operatorOpenId: eventData.operator_id?.open_id,
        action: actionData?.action,
      }

      // 执行所有满足条件的动作
      for (const ruleAction of matchedActions) {
        logger.info(`[飞书] 执行动作: ${rule.name} - ${ruleAction.name}`)

        const actionResult = await executeAction(ruleAction.action, context)

        if (actionResult.success) {
          logger.success(`[飞书]   动作 "${ruleAction.name}" 执行成功`)
        } else {
          logger.error(`[飞书]   动作 "${ruleAction.name}" 执行失败:`, actionResult.error)
        }

        await logExecution({
          rule_id: rule.id!,
          rule_name: `${rule.name} - ${ruleAction.name}`,
          trigger_action: actionData?.action || 'unknown',
          record_id: recordId,
          operator_openid: eventData.operator_id?.open_id,
          record_snapshot: { fields },
          status: actionResult.success ? 'success' : 'failed',
          error_message: actionResult.error,
          duration_ms: actionResult.durationMs,
          response: actionResult.response,
        })

        if (!actionResult.success && rule.on_failure === 'stop') {
          break
        }
      }
    }

    if (eventId) {
      processedEvents.add(eventId)
      eventTimestamps.set(eventId, Date.now())
    }
  } catch (error) {
    logger.error('[飞书] 处理事件失败:', error)
  }
}

export const startEventListener = async () => {
  try {
    registerActions()
    await validateConnections()

    logger.info('[飞书] 正在启动长连接...')

    wsClient.start({
      eventDispatcher: new Lark.EventDispatcher({}).register({
        'drive.file.bitable_record_changed_v1': async (data: any) => {
          processEvent(data, 'v1').catch(err => {
            logger.error('[飞书] 异步处理失败:', err)
          })
        },
        'drive.file.bitable_record_changed_v2': async (data: any) => {
          processEvent(data, 'v2').catch(err => {
            logger.error('[飞书] 异步处理失败:', err)
          })
        },
      }),
    })

    logger.success('[飞书] 长连接事件监听已启动')
  } catch (error) {
    logger.error('[飞书] 启动事件监听失败:', error)
    throw error
  }
}

export default client
