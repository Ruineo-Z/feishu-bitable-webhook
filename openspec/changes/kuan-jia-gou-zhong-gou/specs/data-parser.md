# 数据解析层实现

## 任务描述

实现数据解析层，将飞书事件解析逻辑从 `src/lark.ts` 中抽离，独立为一个可测试、可复用的模块。

## 输入

飞书 WebSocket 推送的原始事件数据（v1 或 v2 格式）

## 输出

`ParsedEvent` 对象，包含结构化的事件数据

## 实现步骤

### 步骤 1：创建目录和基础接口

**文件**：`src/parser/index.ts`

```typescript
// 定义事件类型
export type EventType = 
  | 'record_created'
  | 'record_updated'
  | 'record_deleted'

// 定义解析后的事件结构
export interface ParsedEvent {
  eventId: string
  eventType: EventType
  appToken: string
  tableId: string
  recordId: string
  operatorOpenId: string
  fields: Record<string, unknown>
  beforeFields: Record<string, unknown>
  timestamp: number
}

// 定义解析器接口
export interface EventParser {
  readonly eventTypes: EventType[]
  parse(rawEvent: any): ParsedEvent
  validate(rawEvent: any): boolean
}

// 定义解析器工厂
export interface ParserFactory {
  createParser(eventType: string): EventParser | null
}
```

### 步骤 2：实现字段类型转换

**文件**：`src/parser/field-converter.ts`

```typescript
import { FieldValue } from './index'

export class FieldTypeConverter {
  // 转换飞书格式的人员字段
  static convertUsers(value: any): { id: string }[] {
    if (!value) return []
    if (Array.isArray(value)) {
      return value.map(item => {
        if (item.users && Array.isArray(item.users)) {
          return item.users.map((u: any) => ({ id: u.userId || u.user_id }))
        }
        if (item.user_id) return { id: item.user_id }
        if (item.id) return { id: item.id }
        return { id: String(item) }
      })
    }
    return []
  }
  
  // 转换飞书格式的富文本字段
  static convertRichText(value: any): string {
    if (!value) return ''
    if (Array.isArray(value)) {
      return value.map(item => {
        if (item.type === 'text' && item.text) return item.text
        return String(item)
      }).join('')
    }
    return String(value)
  }
  
  // 转换数值字段
  static convertNumber(value: any): number {
    if (typeof value === 'number') return value
    if (typeof value === 'string') {
      const parsed = parseFloat(value)
      return isNaN(parsed) ? 0 : parsed
    }
    return 0
  }
  
  // 转换布尔值字段
  static convertBoolean(value: any): boolean {
    return Boolean(value)
  }
  
  // 转换关联表字段
  static convertLink(value: any): { id: string }[] {
    if (!value) return []
    if (Array.isArray(value)) {
      return value.map(item => ({ id: item.record_id || item.id || String(item) }))
    }
    return []
  }
  
  // 主转换函数
  static convert(value: any, fieldType: string): FieldValue {
    switch (fieldType) {
      case 'User':
        return this.convertUsers(value)
      case 'RichText':
      case 'Text':
        return this.convertRichText(value)
      case 'Number':
        return this.convertNumber(value)
      case 'Checkbox':
        return this.convertBoolean(value)
      case 'Link':
        return this.convertLink(value)
      default:
        return value
    }
  }
}
```

### 步骤 3：实现飞书事件解析器

**文件**：`src/parser/feishu-parser.ts`

```typescript
import { EventParser, ParsedEvent, EventType } from './index'
import { FieldTypeConverter } from './field-converter'

interface FeishuEventData {
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
  // v2 特有字段
  app_id?: string
  enter_id?: string
  // 字段值
  after_value?: Array<{
    field_id: string
    field_value: string
  }>
  before_value?: Array<{
    field_id: string
    field_value: string
  }>
}

export class FeishuEventParser implements EventParser {
  readonly eventTypes: EventType[] = [
    'record_created',
    'record_updated',
    'record_deleted'
  ]
  
  parse(rawEvent: any): ParsedEvent {
    const data = rawEvent.data as FeishuEventData
    
    if (!this.validate(data)) {
      throw new Error('Invalid Feishu event data')
    }
    
    const action = data.action_list?.[0]
    const eventType = this.getEventType(action?.action)
    
    return {
      eventId: rawEvent.event_id || this.generateEventId(),
      eventType,
      appToken: data.file_token,
      tableId: data.table_id,
      recordId: action?.record_id || '',
      operatorOpenId: data.operator_id?.open_id || '',
      fields: this.extractFields(data.after_value || []),
      beforeFields: this.extractFields(data.before_value || []),
      timestamp: Date.now()
    }
  }
  
  validate(rawEvent: any): boolean {
    if (!rawEvent?.data) return false
    const data = rawEvent.data
    return !!(
      data.file_token &&
      data.table_id &&
      data.action_list?.length > 0
    )
  }
  
  private getEventType(action: string): EventType {
    switch (action) {
      case 'add':
        return 'record_created'
      case 'set':
        return 'record_updated'
      case 'remove':
        return 'record_deleted'
      default:
        return 'record_updated'
    }
  }
  
  private extractFields(values: Array<{ field_id: string; field_value: string }>): Record<string, unknown> {
    const fields: Record<string, unknown> = {}
    for (const item of values) {
      try {
        fields[item.field_id] = JSON.parse(item.field_value)
      } catch {
        fields[item.field_id] = item.field_value
      }
    }
    return fields
  }
  
  private generateEventId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }
}

// 解析器注册表
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

// 自动注册默认解析器
parserRegistry.register('drive.file.bitable_record_changed_v1', new FeishuEventParser())
parserRegistry.register('drive.file.bitable_record_changed_v2', new FeishuEventParser())
```

### 步骤 4：创建解析器入口

**文件**：`src/parser/index.ts`（追加）

```typescript
export * from './feishu-parser'
export * from './field-converter'

// 便捷函数：根据事件类型获取解析器
export function getParser(eventType: string): EventParser | null {
  return parserRegistry.get(eventType)
}

// 便捷函数：解析飞书事件
export function parseFeishuEvent(rawEvent: any): ParsedEvent {
  const eventType = rawEvent?.type || rawEvent?.header?.event_type
  const parser = getParser(eventType)
  
  if (!parser) {
    throw new Error(`No parser found for event type: ${eventType}`)
  }
  
  return parser.parse(rawEvent)
}
```

## 验收标准

- [ ] `ParsedEvent` 类型定义完整
- [ ] `FeishuEventParser` 能正确解析 v1 和 v2 事件
- [ ] `FieldTypeConverter` 支持所有飞书字段类型
- [ ] 事件去重逻辑正常工作
- [ ] 有单元测试覆盖核心逻辑
- [ ] `src/lark.ts` 集成后功能不受影响

## 测试用例

```typescript
describe('FeishuEventParser', () => {
  it('should parse record_created event', () => {
    // 测试创建记录事件
  })
  
  it('should parse record_updated event', () => {
    // 测试更新记录事件
  })
  
  it('should parse record_deleted event', () => {
    // 测试删除记录事件
  })
  
  it('should deduplicate events', () => {
    // 测试事件去重
  })
})

describe('FieldTypeConverter', () => {
  it('should convert User type', () => {
    // 测试人员字段转换
  })
  
  it('should convert RichText type', () => {
    // 测试富文本字段转换
  })
  
  it('should convert Number type', () => {
    // 测试数字字段转换
  })
})
```

## 相关文件

- 输入：`src/lark.ts`（原始事件数据）
- 输出：`src/engine/event-router.ts`（ParsedEvent）
