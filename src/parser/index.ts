// ============================================
// 数据解析层 - 类型定义和接口
// ============================================

// 事件类型
export type EventType = 
  | 'record_created'   // 创建记录
  | 'record_updated'   // 更新记录
  | 'record_deleted'   // 删除记录

// 字段值类型
export type FieldValue = 
  | string
  | number
  | boolean
  | string[]
  | { id: string }[]
  | null

// 解析后的事件结构
export interface ParsedEvent {
  eventId: string              // 事件唯一 ID（用于去重）
  eventType: EventType         // 事件类型
  appToken: string             // 多维表格 Token
  tableId: string              // 数据表 ID
  recordId: string             // 记录 ID
  operatorOpenId: string       // 操作人 Open ID
  fields: Record<string, unknown>       // 变更后字段值
  beforeFields: Record<string, unknown> // 变更前字段值
  timestamp: number            // 事件时间戳
}

// 解析器接口
export interface EventParser {
  // 支持的事件类型
  readonly eventTypes: EventType[]
  
  // 解析飞书原始事件
  parse(rawEvent: any): ParsedEvent
  
  // 验证事件格式
  validate(rawEvent: any): boolean
}

// 解析器工厂接口
export interface ParserFactory {
  createParser(eventType: string): EventParser | null
}

// 飞书原始事件数据（通用部分）
export interface FeishuEventData {
  event_id?: string
  file_token: string
  table_id: string
  action_list?: Array<{
    action: string
    record_id: string
  }>
  operator_id?: {
    open_id: string
  }
  after_value?: Array<{
    field_id: string
    field_value: string
  }>
  before_value?: Array<{
    field_id: string
    field_value: string
  }>
}

export * from './feishu-parser'
export * from './field-converter'
