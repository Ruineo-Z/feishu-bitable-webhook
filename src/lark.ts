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

  // 检查多维表格是否已配置
  const bitable = await bitablesDb.findByTable(appToken, tableId)
  if (!bitable) {
    logger.warn(`[飞书] 未配置的多维表格或表: app_token=${appToken}, table_id=${tableId}`)
    return
  }

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
    if (bitable.field_mappings) {
      fieldMappings = bitable.field_mappings as Record<string, string>
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

async function processFieldChangedEvent(rawEvent: any) {
  const { field_id, field_name, table_id, app_token, action } = rawEvent || {}

  logger.info('[飞书] 字段变更事件:', { field_id, field_name, table_id, app_token, action })

  if (!field_id || !app_token) {
    logger.warn('[飞书] 字段变更事件缺少必要字段')
    return
  }

  try {
    const bitable = await bitablesDb.findByAppToken(app_token)
    if (!bitable) {
      logger.warn(`[飞书] 未配置的多维表格: ${app_token}`)
      return
    }

    // 检查 table_id 是否在配置中
    if (bitable.table_ids.length > 0 && !bitable.table_ids.includes(table_id)) {
      logger.warn(`[飞书] 未配置的表: ${app_token}/${table_id}`)
      return
    }

    switch (action) {
      case 'add':
      case 'update':
        await bitablesDb.addFieldMapping(bitable.id!, field_id, field_name)
        logger.info(`[飞书] 更新字段映射: ${field_id} -> ${field_name}`)
        break
      case 'delete':
        await bitablesDb.removeFieldMapping(bitable.id!, field_id)
        logger.info(`[飞书] 删除字段映射: ${field_id}`)
        break
      default:
        logger.warn(`[飞书] 未知的字段变更动作: ${action}`)
    }
  } catch (error) {
    logger.error('[飞书] 处理字段变更事件失败:', error)
  }
}

async function initializeFieldMappings(bitable: any): Promise<void> {
  if (bitable.field_mappings && Object.keys(bitable.field_mappings).length > 0) {
    logger.info(`[飞书] ${bitable.name} 已存在字段映射，跳过初始化`)
    return
  }

  logger.info(`[飞书] 正在初始化 ${bitable.name} 的字段映射...`)

  try {
    for (const tableId of bitable.table_ids) {
      const res = await client.bitable.v1.appTableField.list({
        path: { app_token: bitable.app_token, table_id: tableId }
      })

      const fields = res.data?.items || []
      const mappings: Record<string, string> = {}

      for (const field of fields) {
        mappings[field.field_id!] = field.field_name!
      }

      // 更新到数据库
      const { error } = await getSupabase()
        .from('bitables')
        .update({
          field_mappings: mappings,
          updated_at: new Date().toISOString()
        })
        .eq('id', bitable.id)

      if (error) throw error

      logger.info(`[飞书] 初始化字段映射成功: ${fields.length} 个字段`)
      break // 只初始化第一个表
    }
  } catch (error) {
    logger.error(`[飞书] 初始化字段映射失败: ${error}`)
  }
}

import { getSupabase } from './db/client'

export const startEventListener = async () => {
  try {
    registerActions()
    await validateConnections()

    // 初始化所有已配置多维表格的字段映射
    const bitables = await bitablesDb.findAll()
    for (const bitable of bitables) {
      await initializeFieldMappings(bitable)
    }

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
        'drive.file.bitable_field_changed_v1': async (data: any) => {
          processFieldChangedEvent(data).catch(err => {
            logger.error('[飞书] 字段变更事件处理失败:', err)
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
