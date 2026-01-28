import { config } from 'dotenv'
import * as Lark from '@larksuiteoapi/node-sdk'
import { RuleMatcher, EventData, MatchedRule } from './engine'
import { executeAction, registerActions } from './actions'
import { executionLogsDb, ExecutionLog } from './db/execution-logs'
import { bitablesDb } from './db/bitables'

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

function parseFieldValue(fieldValue: string): unknown {
  if (!fieldValue) return null
  try {
    return JSON.parse(fieldValue)
  } catch {
    return fieldValue
  }
}

function extractFieldsFromAction(actionData: any): Record<string, unknown> {
  const fields: Record<string, unknown> = {}
  if (!actionData?.after_value) return fields

  for (const item of actionData.after_value) {
    const value = parseFieldValue(item.field_value)
    fields[item.field_id] = value
  }
  return fields
}

async function logExecution(log: Omit<ExecutionLog, 'id' | 'created_at'>): Promise<void> {
  try {
    await executionLogsDb.create(log)
  } catch (error) {
    console.error('[飞书] 写入执行日志失败:', error)
  }
}

async function validateConnections(): Promise<void> {
  console.log('[飞书] 验证多维表格连接配置...')
  const bitables = await bitablesDb.findAll()
  console.log(`[飞书] 已配置 ${bitables.length} 个多维表格`)
  for (const bitable of bitables) {
    console.log(`[飞书] - ${bitable.name}: ${bitable.app_token}`)
  }
}

async function processEvent(data: any, version: string) {
  const eventData: EventData = {
    file_token: data.file_token,
    table_id: data.table_id,
    action_list: data.action_list,
    operator_id: data.operator_id,
  }

  console.log(`[飞书] 收到 ${version} 事件:`, {
    action: data.action_list?.[0]?.action,
    tableId: data.table_id,
    recordId: data.action_list?.[0]?.record_id,
    operatorId: data.operator_id?.open_id,
  })

  // 打印变更前后数据
  const actionData = data.action_list?.[0]
  if (actionData) {
    console.log('[飞书] === 变更数据 ===')
    console.log('操作:', actionData.action)
    console.log('记录ID:', actionData.record_id)
    console.log('变更前:', JSON.stringify(actionData.before_value, null, 2))
    console.log('变更后:', JSON.stringify(actionData.after_value, null, 2))
  }

  try {
    const recordId = actionData?.record_id

    const fields = extractFieldsFromAction(actionData)
    console.log('[飞书] 字段数据:', JSON.stringify(fields, null, 2))

    eventData.record = { fields } as Record<string, unknown>

    const matchedRules = await ruleMatcher.match(eventData)

    if (matchedRules.length === 0) {
      console.log('[飞书] 没有匹配的规则')
      return
    }

    console.log(`[飞书] 匹配到 ${matchedRules.length} 条规则`)

    for (const { rule, recordId } of matchedRules) {
      const context = {
        recordId,
        record: fields,
        operatorOpenId: eventData.operator_id?.open_id,
        action: actionData?.action,
      }

      const actionResult = await executeAction(rule.action, context)

      console.log(`[飞书] 执行规则: ${rule.name}`)
      console.log(`[飞书]   - 动作类型: ${rule.action.type}`)
      console.log(`[飞书]   - 执行结果: ${actionResult.success ? '成功' : '失败'}`)
      if (actionResult.durationMs) {
        console.log(`[飞书]   - 耗时: ${actionResult.durationMs}ms`)
      }
      if (!actionResult.success) {
        console.log(`[飞书]   - 错误: ${actionResult.error}`)
      }
      if (actionResult.response) {
        console.log(`[飞书]   - 响应:`, JSON.stringify(actionResult.response).slice(0, 200))
      }

      await logExecution({
        rule_id: rule.id!,
        rule_name: rule.name,
        trigger_action: actionData?.action || 'unknown',
        record_id: recordId,
        operator_openid: eventData.operator_id?.open_id,
        record_snapshot: { fields },
        status: actionResult.success ? 'success' : 'failed',
        error_message: actionResult.error,
        duration_ms: actionResult.durationMs,
        response: actionResult.response,
      })

      if (!actionResult.success) {
        console.error(`[飞书] 规则 "${rule.name}" 执行失败:`, actionResult.error)
        if (rule.on_failure === 'stop') {
          break
        }
      } else {
        console.log(`[飞书] 规则 "${rule.name}" 执行成功`)
      }
    }
  } catch (error) {
    console.error('[飞书] 处理事件失败:', error)
  }
}

export const startEventListener = async () => {
  try {
    registerActions()
    await validateConnections()

    console.log('[飞书] 正在启动长连接...')

    wsClient.start({
      eventDispatcher: new Lark.EventDispatcher({}).register({
        'drive.file.bitable_record_changed_v1': async (data: any) => {
          await processEvent(data, 'v1')
        },
        'drive.file.bitable_record_changed_v2': async (data: any) => {
          await processEvent(data, 'v2')
        },
      }),
    })

    console.log('[飞书] 长连接事件监听已启动')
  } catch (error) {
    console.error('[飞书] 启动事件监听失败:', error)
    throw error
  }
}

export default client
