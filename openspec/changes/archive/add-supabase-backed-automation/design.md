## Context

当前的飞书多维表格 webhook 服务使用单一 WebSocket 连接监听事件，事件处理器硬编码了日志打印逻辑。服务无法配置化地监听多个多维表格，也不能根据条件触发自动化动作。

**约束：**
- 使用现有 Bun + TypeScript + Hono 技术栈
- 使用 Supabase 作为数据存储
- 需要兼容飞书 WebSocket 事件格式（`drive.file.bitable_record_changed_v1/v2`）
- 需要在单个进程中运行（不拆分微服务）

**利益相关者：**
- 业务用户：需要配置自动化规则
- 开发者：需要维护和扩展系统

## Goals / Non-Goals

**Goals:**
- 支持配置化管理多个飞书多维表格的监听
- 支持复合条件表达式（AND/OR）和多种触发条件
- 支持多种动作类型（飞书消息、外部 API、记录操作等）
- 记录每次触发的执行日志（触发人、执行结果、时间戳）
- 为未来可视化配置界面提供数据基础

**Non-Goals:**
- 可视化规则配置界面（当前仅 API/直接操作数据库）
- 复杂工作流（多步骤串联、条件嵌套等）
- 用户认证和权限系统
- 分布式部署（当前仅单机运行）

## Decisions

### Decision 1: Supabase 作为数据存储

**选择 Supabase 而非其他方案：**

- PostgreSQL 提供强大的查询能力，支持复杂条件匹配
- Row Level Security 为未来多用户场景提供基础
- 实时订阅功能可用于未来实时通知
- 统一的飞书 + Supabase 生态简化运维

**替代方案考虑：**
- SQLite：轻量但查询能力有限
- 纯 JSON 文件：无法高效查询和统计
- MongoDB：过于灵活，缺乏结构化约束

### Decision 2: 数据库 Schema 设计

```
bitables (多维表格配置)
├── id (UUID, PK)
├── app_token (飞书多维表格标识)
├── name (显示名称)
├── table_ids (JSONB, 监听哪些表，空=全部)
├── created_at / updated_at

rules (自动化规则)
├── id (UUID, PK)
├── name (规则名称)
├── enabled (布尔值)
├── bitable_id (FK → bitables.id)
├── trigger (JSONB, 触发条件)
│   ├── app_token
│   ├── table_id
│   ├── actions (record_added, record_edited, record_deleted)
│   └── condition (复合条件表达式)
├── action (JSONB, 动作配置)
│   ├── type (send_feishu_message, call_api, update_record, etc.)
│   └── params
├── on_failure (continue/stop)
├── created_at / updated_at

execution_logs (执行日志)
├── id (UUID, PK)
├── rule_id (FK → rules.id)
├── trigger_action (record_added/edited/deleted)
├── record_id
├── operator_openid
├── record_snapshot (JSONB)
├── status (success/failed/partial)
├── error_message
├── duration_ms
└── created_at
```

### Decision 3: 事件数据获取

**直接使用飞书 Webhook 事件数据，不调用额外 API：**

飞书事件 (`drive.file.bitable_record_changed_v1/v2`) 的 `action_list` 包含完整的变更信息：

```json
{
  "action": "record_edited",
  "record_id": "recxxx",
  "before_value": [
    { "field_id": "fld5j5QoMR", "field_value": "" },
    { "field_id": "fldS8usy0k", "field_value": "iphone21" }
  ],
  "after_value": [
    { "field_id": "fld5j5QoMR", "field_value": "{\"users\":[{\"name\":\"曾瑞\"}]}" },
    { "field_id": "fldS8usy0k", "field_value": "iphone22" }
  ]
}
```

**优势：**
- 无需额外 API 调用，性能更好
- 数据是事件触发时刻的精确快照
- 包含变更前后数据，支持差异检测

### Decision 4: 字段标识方式

**使用 `field_id` 而非字段名：**

飞书事件中使用 `field_id`（如 `fldS8usy0k`）标识字段，而非字段名（如 `设备码`）。

**条件表达式格式：**
```json
{
  "logic": "AND",
  "expressions": [
    { "field": "fldS8usy0k", "operator": "exists" },
    { "field": "fld5j5QoMR", "operator": "not_exists" }
  ]
}
```

**字段 ID 获取方式：**
- 从飞书事件 `action_list.after_value[].field_id` 获取
- 可通过 `before_value` 和 `after_value` 检测字段变更

**操作符支持：**
- 基础：`equals`, `not_equals`, `exists`, `not_exists`
- 字符串：`contains`, `not_contains`
- 数值：`>`, `<`, `>=`, `<=`
- 数组：`contains`, `not_contains`

### Decision 5: 变更检测

支持基于 `before_value` 和 `after_value` 的变更检测：

```typescript
// 获取变更后的字段值
const afterFields = extractFieldsFromAction(actionData.after_value)

// 获取变更前的字段值
const beforeField = extractFieldBefore(actionData.before_value, fieldId)

// 检测字段变更
if (beforeField !== afterField) {
  // 字段值发生了变化
}
```

### Decision 6: 规则引擎架构

```
事件触发
    │
    ▼
┌─────────────────────┐
│   Event Router      │  ← 根据 app_token + table_id 路由
└─────────────────────┘
    │
    ├─────────────────────────────┐
    ▼                             ▼
┌──────────────┐          ┌──────────────┐
│ Rule Loader  │          │              │
│ (从DB加载规则) │          │   (并行匹配)  │
└──────────────┘          └──────────────┘
                                │
                                ▼
                      ┌──────────────────┐
                      │  Condition       │
                      │  Evaluator       │  ← 执行 AND/OR 表达式
                      └──────────────────┘
                                │
                                ▼
                      ┌──────────────────┐
                      │  Action          │
                      │  Executor        │  ← 执行具体动作
                      └──────────────────┘
                                │
                                ▼
                      ┌──────────────────┐
                      │  Log Writer      │  ← 写入执行日志
                      └──────────────────┘
```

### Decision 6: 条件表达式设计

使用 JSON 结构表示复合条件：

```json
{
  "logic": "AND",  // 或 "OR"
  "expressions": [
    { "field": "fldS8usy0k", "operator": "exists" },
    { "field": "fld5j5QoMR", "operator": "not_exists" }
  ]
}
```

**注意：** `field` 使用飞书的 `field_id`（如 `fldS8usy0k`），可从事件数据中获取。

**操作符支持：**
- 存在性：`exists`, `not_exists`
- 字符串：`equals`, `not_equals`, `contains`, `not_contains`
- 数值：`equals`, `not_equals`, `>`, `<`, `>=`, `<=`
- 数组：`contains`, `not_contains`

### Decision 7: 动作类型设计

| 类型 | 说明 | 关键参数 |
|-----|------|---------|
| `send_feishu_message` | 发送飞书消息 | receive_id, content |
| `call_api` | 调用外部 API | url, method, headers, body |
| `update_record` | 更新记录 | app_token, table_id, record_id, fields |
| `create_record` | 创建记录 | app_token, table_id, fields |
| `delete_record` | 删除记录 | app_token, table_id, record_id |
| `webhook` | 触发 Webhook | url, method, payload |

## Risks / Trade-offs

| 风险 | 可能性 | 影响 | 缓解措施 |
|-----|-------|------|---------|
| 飞书 WebSocket 断开重连 | 中 | 高 | 实现自动重连和状态检测 |
| 动作执行超时导致事件堆积 | 中 | 中 | 添加超时控制，异步执行 |
| 循环触发（规则更新同表记录） | 低 | 高 | 规则设计时避免同表循环 |
| Supabase 连接数限制 | 低 | 低 | 使用连接池，合理管理查询 |
| 日志表数据量过大 | 中 | 低 | 定期归档，设置 TTL |

## Implementation Notes

### 数据来源
- 完全使用飞书 Webhook 事件数据，不调用额外 API
- `action_list.after_value` 作为当前字段数据
- `action_list.before_value` 作为变更前数据（用于差异检测）

### 字段标识
- 使用 `field_id`（如 `fldS8usy0k`）作为条件表达式中的字段标识
- 可通过飞书事件数据获取字段 ID，无需额外 API 调用

## Migration Plan

1. **准备阶段**
   - 创建 Supabase 项目和数据库表
   - 添加 Supabase 依赖到项目

2. **开发阶段**
   - 实现数据库操作层（db/）
   - 实现规则引擎（engine/）
   - 实现动作执行器（actions/）
   - 重构事件处理器（lark.ts）

3. **测试阶段**
   - 单元测试（条件匹配、动作执行）
   - 集成测试（完整流程）
   - 在开发环境验证与飞书的连接

4. **部署阶段**
   - 设置 Supabase 环境变量（使用 service_role key）
   - 部署服务
   - 添加初始规则配置

## Open Questions

1. **规则匹配性能**：如果规则数量很多（上百条），每次事件都全量查询是否可行？是否需要缓存？
2. **动作重试**：动作失败时是否需要重试？重试策略是什么？
3. **变更检测扩展**：是否需要支持"字段从某个值变成另一个值"的条件？
