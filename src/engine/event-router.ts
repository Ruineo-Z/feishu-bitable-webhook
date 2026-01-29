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
  record?: {
    fields: Record<string, unknown>
    beforeFields?: Record<string, unknown>
  }
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
      return []
    }

    const bitableConfig = await this.getBitableConfig(appToken, tableId)
    if (!bitableConfig) {
      return []
    }

    const rules = await rulesDb.findByBitable(bitableConfig.id)
    const matchedRules: Array<{ rule: RuleConfig; recordId: string }> = []

    for (const rule of rules) {
      const result = this.matchRule(rule, event, tableId, action, recordId)
      if (result) {
        matchedRules.push(result)
      }
    }

    return matchedRules
  }

  private async getBitableConfig(appToken: string, tableId: string): Promise<BitableConfig | null> {
    const cacheKey = `${appToken}:${tableId}`
    if (this.bitableCache.has(cacheKey)) {
      return this.bitableCache.get(cacheKey)!
    }

    const config = await bitablesDb.findByTable(appToken, tableId)
    if (config) {
      this.bitableCache.set(cacheKey, config)
    }
    return config
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
      operatorOpenId: event.operator_id?.open_id,
      beforeFields: event.record?.beforeFields
    }

    if (rule.trigger.condition) {
      const conditionResult = ConditionEvaluator.evaluate(rule.trigger.condition, context)
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
