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
- Workflow scope 路由（table/global）
- Workflow 插件动作（消息发送 / 记录增删改查）
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
          │     ├── scope 候选检索（table/global）
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
      ├── /doc + /docs
      └── /ui/workflows
```

### 事件处理主流程

```text
飞书记录事件 -> parseFeishuEvent -> processEvent
  1) 按 app_token + table_id 查询字段映射并转换字段键
  2) 按 scope 查询候选 workflows
  3) 执行 workflow steps（condition / action.*）
  4) 异步写 execution_logs
```

字段变更事件流程：

```text
飞书字段变更事件 -> processFieldChangedEvent
  -> upsert/remove bitable_field_mappings
```

### 启动时序（`bun run dev`）

1. `bun --watch start-local.mjs` 启动开发模式。  
2. `start-local.mjs` 加载 `src/index.ts` 并启动 `Bun.serve(:3000)`。  
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

### Swagger UI

启动服务后访问：`http://localhost:3000/docs`

### Workflow 管理页面

启动服务后访问：`http://localhost:3000/ui/workflows`

## Database Schema

### workflows 表

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | 主键 |
| name | text | 工作流名称 |
| config | jsonb | workflow DSL |
| is_active | boolean | 是否启用 |
| scope_type | text | 作用域类型（table/global） |
| app_token | text | table 作用域绑定 app_token |
| table_id | text | table 作用域绑定 table_id |
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
# 工作流路由与作用域
npx tsx tests/workflow/scope-routing.test.ts

# 条件插件
npx tsx tests/workflow/condition.test.ts

# Bitable 动作插件
npx tsx tests/workflow/bitable-plugins.test.ts
```

## Project Structure

```text
src/
├── index.ts                 # HTTP 入口（API/Docs/UI 路由）
├── lark.ts                  # 飞书事件监听与 workflow-only 编排
├── services/
│   └── field-mappings.ts    # 字段映射刷新服务
├── routes/
│   ├── workflow.ts          # 工作流管理接口
│   └── workflow-ui.ts       # 工作流管理页面路由
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
