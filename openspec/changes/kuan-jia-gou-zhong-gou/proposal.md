# 框架重构提案

## 背景

当前飞书多维表格自动化引擎已实现最小可行性验证，但在架构设计上存在以下问题：

1. **数据解析逻辑耦合**：飞书事件解析逻辑与业务逻辑混在一起，难以维护和扩展
2. **条件评估能力有限**：当前条件评估器只支持简单类型，不支持人员、单选、多选等复杂字段类型
3. **日志记录不完整**：无法追踪每个动作的独立执行结果，难以定位问题
4. **缺少跨表格能力**：核心业务需求（跨多维表格操作）尚未实现

## 目标

对系统进行分层重构，实现：

- 清晰的分层架构：入口层 → 数据解析层 → 规则引擎层 → 业务执行层 → 日志层
- 完整的条件评估能力：支持飞书多维表格所有字段类型
- 完善的日志记录：记录完整执行链路，包括每个动作的独立结果
- 跨表格操作能力：实现源表格到目标表格的数据联动

## 非目标

- 暂不开发定时触发功能
- 暂不开发复杂的条件分支（if/else）和循环逻辑
- 暂不开发配置界面

## 变更列表

### 1. 数据解析层

将飞书事件解析逻辑从 `src/lark.ts` 中抽离，独立为数据解析层。

**新增文件**：
- `src/parser/` - 解析器目录
- `src/parser/index.ts` - 解析器接口定义
- `src/parser/feishu-event-parser.ts` - 飞书事件解析器
- `src/parser/field-type-converter.ts` - 字段类型转换器

**修改文件**：
- `src/lark.ts` - 调用解析器，简化 `processEvent` 函数

### 2. 条件评估器增强

增强条件评估器，支持更多字段类型。

**修改文件**：
- `src/engine/condition-evaluator.ts` - 新增字段类型处理器

**新增类型支持**：
- 单选（singleSelect）
- 多选（multiSelect）
- 人员（user）
- 日期（date）
- 复选框（checkbox）
- 关联表（link）

### 3. 日志记录完善

完善执行日志结构，记录每个动作的独立结果。

**修改文件**：
- `src/db/execution-logs.ts` - 扩展日志接口
- `src/lark.ts` - 完善日志记录逻辑

**日志增强**：
- 记录规则版本号
- 记录完整的字段快照（fields 和 beforeFields）
- 记录每个动作的独立执行结果

### 4. 跨表格操作

实现跨多维表格的数据联动能力。

**新增文件**：
- `src/actions/cross-table.ts` - 跨表格操作动作

**动作定义**：
- 从源表格读取记录
- 字段映射和转换
- 写入目标表格

## 技术设计

### 数据解析层

```typescript
// 解析器接口
interface EventParser {
  eventType: string
  parse(rawEvent: any): ParsedEvent
}

// 解析后的事件结构
interface ParsedEvent {
  eventId: string
  eventType: 'record_created' | 'record_updated' | 'record_deleted'
  appToken: string
  tableId: string
  recordId: string
  operatorOpenId: string
  fields: Record<string, unknown>
  beforeFields: Record<string, unknown>
  timestamp: number
}
```

### 条件评估器增强

```typescript
interface FieldTypeHandlers {
  text: (a: unknown, b: unknown) => boolean
  number: (a: unknown, b: unknown) => boolean
  singleSelect: (a: unknown, b: unknown) => boolean
  multiSelect: (a: unknown, b: unknown) => boolean
  user: (a: unknown, b: unknown) => boolean
  date: (a: unknown, b: unknown) => boolean
  checkbox: (a: unknown, b: unknown) => boolean
  link: (a: unknown, b: unknown) => boolean
}
```

### 日志结构增强

```typescript
interface ExecutionLog {
  // 基础信息
  id: string
  rule_id: string
  rule_name: string
  rule_version: number
  trigger_action: string
  record_id: string
  operator_openid: string

  // 完整快照
  fields: Record<string, unknown>
  beforeFields: Record<string, unknown>

  // 动作执行详情
  actions: Array<{
    name: string
    type: string
    params: Record<string, unknown>
    status: 'success' | 'failed'
    error?: string
    durationMs: number
    response?: Record<string, unknown>
  }>

  // 汇总信息
  status: 'success' | 'partial' | 'failed'
  totalDurationMs: number
}
```

## 迁移计划

### 第一阶段：数据解析层

1. 创建 `src/parser/` 目录
2. 定义解析器接口
3. 实现飞书事件解析器
4. 修改 `src/lark.ts` 使用解析器

### 第二阶段：条件评估器增强

1. 新增字段类型处理器
2. 支持单选、多选、人员、日期等类型
3. 更新条件评估器

### 第三阶段：日志记录完善

1. 扩展日志接口
2. 修改日志记录逻辑
3. 记录每个动作的独立结果

### 第四阶段：跨表格操作

1. 创建跨表格动作组件
2. 实现字段映射和转换
3. 添加测试用例

## 风险

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 解析逻辑变更 | 可能影响现有功能 | 保持接口兼容，提供回退机制 |
| 字段类型转换 | 可能丢失数据 | 完善类型映射，提供默认值 |
| 跨表格操作 | 实现复杂度高 | 先实现最小可行版本 |

## 验收标准

- [ ] 数据解析层独立，接口清晰
- [ ] 条件评估器支持所有飞书字段类型
- [ ] 日志记录完整，可追溯执行链路
- [ ] 跨表格操作正常工作
- [ ] 所有现有功能保持兼容
- [ ] 单元测试覆盖率不低于 80%
