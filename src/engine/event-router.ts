import { RuleConfig, rulesDb } from '../db/rules'
import { bitablesDb, BitableConfig } from '../db/bitables'
import { ConditionEvaluator, EvaluationContext } from './condition-evaluator'

export interface EventData {
  file_token: string
  table_id: string
  action_list: Array<{
    action: string
    record_id: string
  }>
  operator_id?: {
    open_id: string
  }
  record?: Record<string, unknown>
}

export interface MatchedRule {
  rule: RuleConfig
  recordId: string
}

export class EventRouter {
  private bitableCache: Map<string, BitableConfig> = new Map()

  async route(event: EventData): Promise<MatchedRule[]> {
    const appToken = event.file_token
    const tableId = event.table_id
    const action = event.action_list?.[0]?.action
    const recordId = event.action_list?.[0]?.record_id

    if (!appToken || !tableId || !action || !recordId) {
      console.warn('[EventRouter] Invalid event data:', { appToken, tableId, action, recordId })
      return []
    }

    const bitableConfigs = await this.getBitableConfigs(appToken, tableId)
    if (bitableConfigs.length === 0) {
      console.log('[EventRouter] No bitable config found for:', { appToken, tableId })
      return []
    }

    const enabledRules = await rulesDb.findEnabledByAppToken(appToken)

    const matchedRules: MatchedRule[] = []

    for (const rule of enabledRules) {
      const match = this.matchRule(rule, event, tableId, action, recordId)
      if (match) {
        matchedRules.push(match)
      }
    }

    console.log('[EventRouter] Matched rules:', matchedRules.length)
    return matchedRules
  }

  private async getBitableConfigs(appToken: string, tableId: string): Promise<BitableConfig[]> {
    const cacheKey = `${appToken}:${tableId}`
    if (this.bitableCache.has(cacheKey)) {
      return this.bitableCache.get(cacheKey)!
    }

    const configs = await bitablesDb.findByTable(appToken, tableId)
    this.bitableCache.set(cacheKey, configs)
    return configs
  }

  private matchRule(
    rule: RuleConfig,
    event: EventData,
    tableId: string,
    action: string,
    recordId: string
  ): MatchedRule | null {
    if (rule.trigger.table_id !== tableId) {
      return null
    }

    if (!rule.trigger.actions.includes(action)) {
      return null
    }

    const context: EvaluationContext = {
      fields: event.record?.fields as Record<string, unknown> || {},
      recordId,
      action,
      operatorOpenId: event.operator_id?.open_id
    }

    if (rule.trigger.condition) {
      const context: EvaluationContext = {
        fields: event.record?.fields as Record<string, unknown> || {},
        recordId,
        action,
        operatorOpenId: event.operator_id?.open_id
      }

      console.log('[EventRouter] 评估条件:', JSON.stringify(rule.trigger.condition))
      console.log('[EventRouter] 记录字段:', JSON.stringify(context.fields))

      const conditionResult = ConditionEvaluator.evaluate(rule.trigger.condition, context)
      console.log('[EventRouter] 条件评估结果:', conditionResult)

      if (!conditionResult) {
        return null
      }
    }

    return {
      rule,
      recordId
    }
  }

  clearCache(): void {
    this.bitableCache.clear()
  }
}
