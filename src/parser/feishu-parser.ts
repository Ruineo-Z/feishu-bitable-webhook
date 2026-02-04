import {
  EventParser,
  ParsedEvent,
  EventType,
} from './index'

/**
 * 飞书事件解析器
 * 将飞书 WebSocket 推送的原始事件转换为 ParsedEvent
 *
 * 实际事件格式（扁平结构，无嵌套）:
 * {
 *   "schema": "2.0",
 *   "event_id": "xxx",
 *   "event_type": "drive.file.bitable_record_changed_v1",
 *   "create_time": "xxx",
 *   "file_token": "xxx",
 *   "table_id": "xxx",
 *   "operator_id": { "open_id": "xxx", "union_id": "xxx", "user_id": null },
 *   "action_list": [{ "record_id": "xxx", "action": "record_edited", "before_value": [...], "after_value": [...] }]
 * }
 */
export class FeishuEventParser implements EventParser {
  readonly eventTypes: EventType[] = [
    'record_created',
    'record_updated',
    'record_deleted'
  ]

  /**
   * 解析飞书原始事件
   */
  parse(rawEvent: any): ParsedEvent {
    if (!this.validate(rawEvent)) {
      throw new Error('Invalid Feishu event data')
    }

    // 事件数据直接在顶层（无嵌套）
    const action = rawEvent.action_list?.[0]

    const eventType = this.getEventType(action?.action)

    return {
      eventId: rawEvent.event_id || this.generateEventId(),
      eventType,
      appToken: rawEvent.file_token,
      tableId: rawEvent.table_id,
      recordId: action?.record_id || '',
      operatorOpenId: rawEvent.operator_id?.open_id || '',
      fields: this.extractFields(rawEvent.action_list, 'after_value'),
      beforeFields: this.extractFields(rawEvent.action_list, 'before_value'),
      timestamp: Number(rawEvent.create_time) || Date.now()
    }
  }

  /**
   * 验证事件格式
   */
  validate(rawEvent: any): boolean {
    if (!rawEvent) return false
    return !!(
      rawEvent.file_token &&
      rawEvent.table_id &&
      rawEvent.action_list?.length > 0
    )
  }

  /**
   * 根据 action 判断事件类型
   * 官方枚举: record_added, record_deleted, record_edited
   */
  private getEventType(action?: string): EventType {
    switch (action) {
      case 'record_added':
        return 'record_created'
      case 'record_deleted':
        return 'record_deleted'
      case 'record_edited':
      default:
        return 'record_updated'
    }
  }

  /**
   * 提取字段值
   * 从 action_list 中提取 before_value 或 after_value
   */
  private extractFields(
    actionList: Array<{ before_value?: any[]; after_value?: any[] }> | undefined,
    valueType: 'before_value' | 'after_value'
  ): Record<string, unknown> {
    const fields: Record<string, unknown> = {}

    if (!actionList) return fields

    for (const action of actionList) {
      const values = action[valueType]
      if (!values) continue

      for (const item of values) {
        const fieldId = item.field_id
        const fieldIdentityValue = item.field_identity_value
        const fieldValue = item.field_value

        // 如果有 field_identity_value（人员字段），优先使用其中的 user_id.open_id
        // 飞书 API 要求人员字段格式为: [{ id: "ou_xxx" }]
        if (fieldIdentityValue?.users && Array.isArray(fieldIdentityValue.users)) {
          const users = fieldIdentityValue.users.map((u: any) => ({
            id: u.user_id?.open_id || u.user_id?.user_id || u.user_id?.union_id
          }))
          fields[fieldId] = users.length === 1 ? users : users
        } else if (fieldValue !== undefined && fieldValue !== '') {
          // 普通字段值
          try {
            fields[fieldId] = JSON.parse(fieldValue)
          } catch {
            fields[fieldId] = fieldValue
          }
        } else {
          fields[fieldId] = null
        }
      }
    }

    return fields
  }

  /**
   * 生成事件 ID
   */
  private generateEventId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
  }
}

/**
 * 解析器注册表
 */
export const parserRegistry = {
  parsers: new Map<string, EventParser>(),

  register(eventType: string, parser: EventParser): void {
    this.parsers.set(eventType, parser)
  },

  get(eventType: string): EventParser | null {
    return this.parsers.get(eventType) || null
  },

  getAll(): EventParser[] {
    return Array.from(this.parsers.values())
  }
}

// 自动注册飞书事件解析器
parserRegistry.register('drive.file.bitable_record_changed_v1', new FeishuEventParser())
parserRegistry.register('drive.file.bitable_record_changed_v2', new FeishuEventParser())

/**
 * 便捷函数：根据事件类型获取解析器
 */
export function getParser(eventType: string): EventParser | null {
  return parserRegistry.get(eventType)
}

/**
 * 便捷函数：解析飞书事件
 */
export function parseFeishuEvent(rawEvent: any): ParsedEvent {
  // 获取事件类型
  const eventType = rawEvent.event_type || rawEvent.type

  if (!eventType) {
    throw new Error('Cannot determine event type')
  }

  const parser = getParser(eventType)

  if (!parser) {
    throw new Error(`No parser found for event type: ${eventType}`)
  }

  return parser.parse(rawEvent)
}

/**
 * 便捷函数：验证飞书事件
 */
export function validateFeishuEvent(rawEvent: any): boolean {
  const eventType = rawEvent.event_type || rawEvent.type
  const parser = getParser(eventType || '')
  return parser?.validate(rawEvent) || false
}
