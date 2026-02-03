import { config } from 'dotenv'
import * as Lark from '@larksuiteoapi/node-sdk'
import { RuleMatcher, EventData, MatchedRule } from './engine'
import { executeAction, registerActions } from './actions'
import { executionLogsDb, ExecutionLog } from './db/execution-logs'
import { bitablesDb } from './db/bitables'
import { logger, createEventTraceId, createFeishuLogger } from './logger'
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

async function logExecution(executionLog: Omit<ExecutionLog, 'id' | 'created_at'>): Promise<void> {
  try {
    await executionLogsDb.create(executionLog)
  } catch (error) {
    // Cannot use log here as this is called from within processEvent
    logger.error('[飞书] 写入执行日志失败:', error)
  }
}

async function validateConnections(): Promise<void> {
  const log = createFeishuLogger('INIT')
  log.info('验证多维表格连接配置...')
  const bitables = await bitablesDb.findAll()
  log.info(`已配置 ${bitables.length} 个多维表格`)
  for (const bitable of bitables) {
    log.info(`- ${bitable.name}: ${bitable.app_token}`)
  }
}

async function processEvent(rawEvent: any, version: string) {
  // 为每个事件生成追踪 ID
  const traceId = createEventTraceId()
  const log = createFeishuLogger(traceId)

  // 使用解析器解析飞书事件
  let parsedEvent: ParsedEvent
  try {
    parsedEvent = parseFeishuEvent(rawEvent)
  } catch (error) {
    log.error('解析事件失败:', error)
    return
  }

  const { eventId, eventType, appToken, tableId, recordId, operatorOpenId, fields, beforeFields } = parsedEvent

  // 检查多维表格是否已配置
  const bitable = await bitablesDb.findByTable(appToken, tableId)
  if (!bitable) {
    log.warn(`未配置: app_token=${appToken}, table_id=${tableId}`)
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
    log.warn(`事件已处理: ${eventId}`)
    return
  }

  log.info(`${bitable.name || appToken}: ${eventType} ${recordId}`)

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

  // 打印变更日志（合并为一条，便于追踪）
  const eventLog = {
    event: eventType,
    recordId,
    operator: operatorOpenId,
    before: beforeFields,
    after: fields
  }
  log.info(JSON.stringify(eventLog))

  try {
    let fieldMappings: Record<string, string> = {}
    if (bitable.field_mappings) {
      fieldMappings = bitable.field_mappings as Record<string, string>
    }

    const matchedRules = await ruleMatcher.match(eventData)

    if (matchedRules.length === 0) {
      log.info('无匹配规则')
      return
    }

    log.info('匹配规则: ' + matchedRules.map(r => r.rule.name).join(', '))

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
        log.info(`执行动作: ${rule.name} - ${ruleAction.name}`)

        const actionResult = await executeAction(ruleAction.action, context)

        if (actionResult.success) {
          log.success(`动作 "${ruleAction.name}" 执行成功`)
        } else {
          log.error(`动作 "${ruleAction.name}" 执行失败:`, actionResult.error)
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
      log.error('处理事件失败:', error)
    }
  }

async function processFieldChangedEvent(rawEvent: any) {
  const traceId = createEventTraceId()
  const log = createFeishuLogger(traceId)

  const app_token = rawEvent?.file_token
  const table_id = rawEvent?.table_id
  const actionItem = rawEvent?.action_list?.[0]
  const field_id = actionItem?.field_id
  const field_name = actionItem?.after_value?.name
  const action = actionItem?.action

  log.info('字段变更解析:', { app_token, table_id, field_id, field_name, action })

  if (!field_id || !app_token) {
    log.warn('字段变更事件缺少必要字段')
    return
  }

  try {
    const bitableConfig = await bitablesDb.findByTable(app_token, table_id)
    if (!bitableConfig) {
      log.warn(`未配置的表: ${app_token}/${table_id}`)
      return
    }

    switch (action) {
      case 'add':
      case 'update':
        await bitablesDb.addFieldMapping(bitableConfig.id!, field_id, field_name)
        log.info(`更新字段映射: ${field_id} -> ${field_name}`)
        break
      case 'delete':
        await bitablesDb.removeFieldMapping(bitableConfig.id!, field_id)
        log.info(`删除字段映射: ${field_id}`)
        break
      default:
        log.warn(`未知的字段变更动作: ${action}`)
    }
  } catch (error) {
    log.error('处理字段变更事件失败:', error)
  }
}

async function initializeFieldMappings(bitable: any): Promise<void> {
  const log = createFeishuLogger('INIT')
  if (bitable.field_mappings && Object.keys(bitable.field_mappings).length > 0) {
    log.info(`${bitable.name} (${bitable.table_id}) 已存在字段映射，跳过初始化`)
    return
  }

  log.info(`正在初始化 ${bitable.name} (${bitable.table_id}) 的字段映射...`)

  try {
    const res = await client.bitable.v1.appTableField.list({
      path: { app_token: bitable.app_token, table_id: bitable.table_id }
    })

    const fields = res.data?.items || []
    const mappings: Record<string, string> = {}

    for (const field of fields) {
      mappings[field.field_id!] = field.field_name!
    }

    // 更新到数据库
    const updates: any = {
      field_mappings: mappings,
      updated_at: new Date().toISOString()
    }

    // 如果没有表名，使用多维表格名称作为默认
    if (!bitable.table_name && bitable.name) {
      updates.table_name = bitable.name
    }

    const { error } = await getSupabase()
      .from('bitables')
      .update(updates)
      .eq('id', bitable.id)

    if (error) throw error

    log.info(`初始化字段映射成功: ${fields.length} 个字段`)
  } catch (error) {
    log.error(`初始化字段映射失败:`, error)
  }
}

import { getSupabase } from './db/client'

export const startEventListener = async () => {
  const log = createFeishuLogger('START')
  try {
    registerActions()
    await validateConnections()

    // 初始化所有已配置多维表格的字段映射
    const bitables = await bitablesDb.findAll()
    for (const bitable of bitables) {
      await initializeFieldMappings(bitable)
    }

    log.info('正在启动长连接...')

    wsClient.start({
      eventDispatcher: new Lark.EventDispatcher({}).register({
        'drive.file.bitable_record_changed_v1': async (data: any) => {
          processEvent(data, 'v1').catch(err => {
            log.error('v1 事件异步处理失败:', err)
          })
        },
        'drive.file.bitable_record_changed_v2': async (data: any) => {
          processEvent(data, 'v2').catch(err => {
            log.error('v2 事件异步处理失败:', err)
          })
        },
        'drive.file.bitable_field_changed_v1': async (data: any) => {
          processFieldChangedEvent(data).catch(err => {
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

export default client
