import { config } from 'dotenv'
import * as Lark from '@larksuiteoapi/node-sdk'
import { RuleMatcher, EventData, MatchedRule } from './engine'
import { executeAction, registerActions } from './actions'
import { executionLogsDb, ExecutionLog } from './db/execution-logs'
import { bitablesDb } from './db/bitables'
import { logger } from './logger'
import { parseFeishuEvent, ParsedEvent } from './parser'

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

async function processEvent(rawEvent: any, version: string) {
  // 临时调试：打印原始事件
  console.log('【调试】原始事件:', JSON.stringify(rawEvent, null, 2))

  // 使用解析器解析飞书事件
  let parsedEvent: ParsedEvent
  try {
    parsedEvent = parseFeishuEvent(rawEvent)
  } catch (error) {
    logger.error('[飞书] 解析事件失败:', error)
    return
  }

  const { eventId, eventType, appToken, tableId, recordId, operatorOpenId, fields, beforeFields, timestamp } = parsedEvent

  const now = Date.now()
  for (const [id, ts] of eventTimestamps.entries()) {
    if (now - ts > PROCESSED_EVENTS_TTL) {
      processedEvents.delete(id)
      eventTimestamps.delete(id)
    }
  }

  if (eventId && processedEvents.has(eventId)) {
    logger.warn(`[飞书] 事件 ${eventId} 已处理过，跳过`)
    return
  }

  logger.info('[飞书] 收到事件:', {
    eventType,
    tableId,
    recordId,
    operatorId: operatorOpenId,
    fields,      // 变更后字段
    beforeFields,  // 变更前字段
  })

  // 构建事件数据（兼容现有 EventData 结构）
  const eventData: EventData = {
    file_token: appToken,
    table_id: tableId,
    action_list: [{
      action: eventType === 'record_created' ? 'add' : eventType === 'record_deleted' ? 'remove' : 'set',
      record_id: recordId
    }],
    operator_id: operatorOpenId ? { open_id: operatorOpenId } : undefined,
    record: { fields, beforeFields }
  }

  try {
    let fieldMappings: Record<string, string> = {}
    try {
      const bitable = await bitablesDb.findByAppToken(appToken)
      if (bitable?.field_mappings) {
        fieldMappings = bitable.field_mappings as Record<string, string>
      }
    } catch (e) {
      logger.warn('[飞书] 获取字段映射失败，使用默认映射')
    }

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
        operatorOpenId: operatorOpenId,
        action: eventData.action_list?.[0]?.action || 'unknown',
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
          trigger_action: eventData.action_list?.[0]?.action || 'unknown',
          record_id: recordId,
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
