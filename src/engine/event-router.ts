import { RuleConfig, rulesDb, RuleActionConfig } from '../db/rules'
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
  matchedActions: RuleActionConfig[]  // 满足条件的动作列表
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
    const matchedRules: MatchedRule[] = []

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

    // 评估全局触发条件
    if (rule.trigger.condition) {
      const conditionResult = ConditionEvaluator.evaluate(rule.trigger.condition, context)
      if (!conditionResult) {
        return null
      }
    }

    // 筛选满足条件的动作
    const matchedActions: RuleActionConfig[] = []
    for (const ruleAction of rule.actions) {
      // 如果动作没有条件，直接匹配
      if (!ruleAction.condition) {
        matchedActions.push(ruleAction)
        continue
      }
      // 评估动作条件
      const actionConditionResult = ConditionEvaluator.evaluate(ruleAction.condition, context)
      if (actionConditionResult) {
        matchedActions.push(ruleAction)
      }
    }

    if (matchedActions.length === 0) {
      return null
    }

    return {
      rule,
      recordId,
      matchedActions
    }
  }

  clearCache(): void {
    this.bitableCache.clear()
  }
}
