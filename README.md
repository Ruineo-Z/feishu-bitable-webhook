# Feishu Bitable Webhook

飞书多维表格自动化引擎，监听多维表格记录变更事件并触发 **workflow-only** 自动化流程。

## Tech Stack

- **Runtime**: Bun
- **Language**: TypeScript
- **Web Framework**: Hono + @hono/zod-openapi
- **Database**: Supabase (PostgreSQL)
- **API Documentation**: Swagger UI

## Features

- 飞书多维表格 WebSocket 长连接事件监听
- Workflow scope 路由（table + optional eventTypes）
- Workflow 插件动作（消息发送：SDK + 群机器人 webhook / 记录增删改查）
- Workflow DSL（支持 DAG 分支：condition onTrue/onFalse + next）
- 字段映射 registry（`field_id -> field_name`）
- 执行日志查询

## 后端框架与流程

### 架构总览

```text
Feishu Bitable Events (WS)
          │
          ▼
   src/lark.ts 事件接入层
          │
          ├── workflow 路由与执行
          │     ├── scope 候选检索（table + eventTypes）
          │     ├── 字段映射转换（field_id -> field_name）
          │     └── Workflow Engine + Plugins
          │
          └── 字段变更事件同步
                └── bitable_field_mappings registry

HTTP 请求
  └── src/index.ts (Hono)
      ├── /api/workflows
      ├── /api/logs
      ├── /api/mappings
      ├── /api/mappings/refresh
      └── /doc + /docs
```

### 事件处理主流程

```text
飞书记录事件 -> parseFeishuEvent -> processEvent
  1) 按 app_token + table_id 查询字段映射并转换字段键
  2) 按 scope + eventTypes 查询候选 workflows
  3) 执行 workflow steps（condition / action.*）
  4) 异步写 execution_logs
```

字段变更事件流程：

```text
飞书字段变更事件 -> processFieldChangedEvent
  -> upsert/remove bitable_field_mappings
```

### 事件解析层：字段类型支持与变更判断

#### 1) 入站事件与字段快照

- 已接入事件：
  - `drive.file.bitable_record_changed_v1`
  - `drive.file.bitable_record_changed_v2`
  - `drive.file.bitable_field_changed_v1`（用于维护字段映射）
- 对记录变更事件，统一抽取：
  - `fields`（after）
  - `beforeFields`（before）
- 人员字段会优先从 `field_identity_value.users` 归一为 `[{ id: "ou_xxx" }]`。

#### 2) 已实现字段类型（Codec）

当前已支持以下规范类型（decode / write / filter）：

- `text`
- `number`
- `single_select`
- `multi_select`
- `date`
- `checkbox`
- `user`
- `url`
- `attachment`
- `link`
- `location`
- `group`
- `formula`
- `unknown`（降级透传 + warning）

其中你关注的几类已覆盖：**人员、数字、文本、多选**。

#### 3) 每种字段类型可用判断（`condition` 节点）

> `condition` 节点使用的是工作流条件引擎操作符（如 `equals`、`not_exists`、`<`）。

| 字段类型 | 已实现判断 |
|---|---|
| `text` | `equals` / `not_equals` / `contains` / `not_contains` / `exists` / `not_exists` |
| `number` | `equals` / `not_equals` / `>` / `<` / `>=` / `<=` / `exists` / `not_exists` |
| `singleSelect` | `equals` / `not_equals` / `exists` / `not_exists` |
| `multiSelect` | `contains` / `not_contains` / `exists` / `not_exists` / `in` |
| `user` | `contains` / `not_contains` / `exists` / `not_exists` / `in` |
| `date` | `equals` / `not_equals` / `>` / `<` / `>=` / `<=` / `exists` / `not_exists` / `between` |
| `checkbox` | `equals` / `not_equals` |
| `link` | `contains` / `not_contains` / `exists` / `not_exists` / `in` |

补充：

- `changed` 为全局操作符，可用于 before/after 变更判断。
- `source: "before"` / `source: "after"` 可指定比较来源（默认 `after`）。
- `changed` 的实现为：`fields[field]`（after）与 `beforeFields[field]` 做 JSON 序列化比较（支持嵌套路径，不依赖 `source`）。

#### 4) 每种字段类型可用判断（`action.bitable.query/delete` 的 `filter`）

> `query/delete` 走飞书筛选操作符（如 `isEmpty`、`isLess`），与 `condition` 节点不是同一套命名。

| 字段类型（Codec） | 已实现筛选操作符 |
|---|---|
| `text` | `is` / `isNot` / `contains` / `doesNotContain` / `isEmpty` / `isNotEmpty` |
| `number` | `is` / `isNot` / `isGreater` / `isGreaterEqual` / `isLess` / `isLessEqual` / `isEmpty` / `isNotEmpty` |
| `single_select` | `is` / `isNot` / `contains` / `doesNotContain` / `isEmpty` / `isNotEmpty` |
| `multi_select` | `is` / `isNot` / `contains` / `doesNotContain` / `isEmpty` / `isNotEmpty` |
| `date` | `is` / `isGreater` / `isLess` / `isEmpty` / `isNotEmpty` |
| `checkbox` | `is` |
| `user` | `is` / `isNot` / `contains` / `doesNotContain` / `isEmpty` / `isNotEmpty` |
| `url` | `is` / `isNot` / `contains` / `doesNotContain` / `isEmpty` / `isNotEmpty` |
| `attachment` | `isEmpty` / `isNotEmpty` |
| `link` | `is` / `isNot` / `contains` / `doesNotContain` / `isEmpty` / `isNotEmpty` |
| `location` | `is` / `isNot` / `contains` / `doesNotContain` / `isEmpty` / `isNotEmpty` |
| `group` | `is` / `isNot` / `contains` / `doesNotContain` / `isEmpty` / `isNotEmpty` |
| `formula` | 不支持作为筛选条件 |

#### 5) 当前边界（重要）

- 条件引擎运行时已注入 `fieldTypes`（支持字段名/字段 ID 映射），可识别类型会优先命中对应类型处理器。
- 字段类型缺失或未识别时，条件评估会回退文本处理器继续执行，并输出 `type_fallbacks` 诊断信息用于排查。
- 过滤编码中 `like` / `in` 目前明确不支持。
- `formula` / `lookup` 字段不支持作为筛选条件。

### 启动时序（`bun run dev`）

1. `bun --watch start-local.mjs` 启动开发模式。  
2. `start-local.mjs` 加载 `src/index.ts` 并启动 `Bun.serve(:3333)`。  
3. `src/index.ts` 注册 HTTP 路由后调用 `startEventListener()`。  
4. `startEventListener()` 会：
   - 注册 workflow 插件；
   - 启动飞书 WS 长连接并注册事件分发；
   - 在字段变更事件中持续维护字段映射 registry。

可通过日志快速判断是否启动完整：
- `[ROUTE] ...`
- `workflow-only 模式已启用...`
- `正在启动长连接...`
- `长连接事件监听已启动`

## Quick Start

```bash
# 安装依赖
bun install

# 配置环境变量
cp .env.example .env
# 编辑 .env 填入飞书应用凭证和 Supabase 连接信息

# 开发模式
bun run dev

# 生产模式
bun run start

```

## Configuration

```env
# 飞书应用凭证
FEISHU_APP_ID=your_app_id
FEISHU_APP_SECRET=your_app_secret

# Supabase 连接
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_service_role_key

```

## API Endpoints

### 日志

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/logs` | 查询执行日志列表 |
| GET | `/api/logs/{id}` | 获取单条日志详情 |
| DELETE | `/api/logs/{id}` | 删除单条日志 |

### 字段映射（推荐）

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/mappings?appToken=...&tableId=...` | 查询字段映射 registry |
| POST | `/api/mappings/refresh` | 按 `appToken + tableId` 刷新字段映射 |

### Workflow Agent 编排闭环

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/workflows/dry-run` | 校验候选 DSL（含 dry-run 与结构化错误），不落库发布 |

### Swagger UI

启动服务后访问：`http://localhost:3333/docs`


## Migration Scripts

```bash
# scope 字段回填（table 绑定 + trigger_actions）
bun run backfill:workflow-scope

# 事件过滤结构化字段回填（trigger.config.action/actions -> trigger_actions）
bun run backfill:workflow-trigger-actions
```

## Database Schema

### workflows 表

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | 主键 |
| name | text | 工作流名称 |
| config | jsonb | Workflow DSL（支持 DAG 分支） |
| is_active | boolean | 是否启用 |
| scope_type | text | 作用域类型（仅 table） |
| app_token | text | table 作用域绑定 app_token |
| table_id | text | table 作用域绑定 table_id |
| trigger_actions | text[] | 可选事件过滤（record_created/record_updated/record_deleted），NULL 表示通配 |
| created_at | timestamptz | 创建时间 |
| updated_at | timestamptz | 更新时间 |

### bitable_field_mappings 表

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | 主键 |
| app_token | text | 多维表 app_token |
| table_id | text | 数据表 table_id |
| field_id | text | 飞书字段 ID |
| field_name | text | 字段名 |
| created_at | timestamptz | 创建时间 |
| updated_at | timestamptz | 更新时间 |

### execution_logs 表

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | 主键 |
| rule_id | uuid/text | 触发主体 ID（规则或工作流） |
| rule_name | text | 触发主体名称 |
| trigger_action | text | 触发动作 |
| record_id | text | 记录 ID |
| operator_openid | text | 操作人 Open ID |
| record_snapshot | jsonb | 记录快照 |
| status | text | 状态 (success/failed/partial) |
| error_message | text | 错误信息 |
| duration_ms | integer | 执行耗时 |
| response | jsonb | 响应数据 |
| created_at | timestamptz | 创建时间 |

## Testing

```bash
# 工作流路由与作用域（含 eventTypes）
npx tsx tests/workflow/scope-routing.test.ts

# scope 与事件过滤迁移回填
npx tsx tests/workflow/scope-migration.test.ts

# 分支执行与 DAG 校验
npx tsx tests/workflow/branching-engine.test.ts

# 条件插件
npx tsx tests/workflow/condition.test.ts

# Bitable 动作插件
npx tsx tests/workflow/bitable-plugins.test.ts

# dry-run 执行链路
npx tsx tests/workflow/dry-run-engine.test.ts

# Feishu webhook 消息插件
npx tsx tests/workflow/feishu-webhook-plugin.test.ts

# Agent 编排校验闭环
npx tsx tests/workflow/authoring-loop.test.ts

# Agent 编排路由接口
npx tsx tests/workflow/authoring-route.test.ts

```



## Project Structure

```text
src/
├── index.ts                 # HTTP 入口（API/Docs 路由）
├── lark.ts                  # 飞书事件监听与 workflow-only 编排
├── services/
│   └── field-mappings.ts    # 字段映射刷新服务
├── routes/
│   ├── workflow.ts          # 工作流管理接口
│   └── workflow-authoring.ts# Agent 编排校验与确认发布接口
├── db/
│   ├── client.ts            # Supabase 客户端
│   ├── field-mappings.ts    # 字段映射 registry 访问层
│   ├── workflows.ts         # 工作流数据访问
│   └── execution-logs.ts    # 执行日志数据访问
└── workflow/
    ├── core/                # 工作流引擎核心
    ├── plugins/             # 工作流插件（condition/action.*）
    └── scope.ts             # scope 路由模型
```
