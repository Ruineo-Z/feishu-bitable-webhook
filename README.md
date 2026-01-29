# Feishu Bitable Webhook

飞书多维表格自动化引擎，监听多维表格记录变更事件并触发自动化规则。

## Tech Stack

- **Runtime**: Bun
- **Language**: TypeScript
- **Web Framework**: Hono + @hono/zod-openapi
- **Database**: Supabase (PostgreSQL)
- **API Documentation**: Swagger UI

## Features

- 飞书多维表格 WebSocket 长连接事件监听
- 基于条件的规则引擎
- 支持多种动作类型：
  - 发送飞书消息
  - HTTP API 调用
  - 创建/更新/删除记录
- 执行日志查询
- Supabase 数据库持久化

## Quick Start

```bash
# 安装依赖
bun install

# 配置环境变量
cp .env.example .env
# 编辑 .env 填入飞书应用凭证和 Supabase 连接信息

# 开发模式
bun dev

# 生产模式
bun start
```

## Configuration

```env
# 飞书应用凭证
FEISHU_APP_ID=your_app_id
FEISHU_APP_SECRET=your_app_secret

# Supabase 连接
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

## API Endpoints

### 日志查询

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/logs` | 查询执行日志列表 |
| GET | `/api/logs/{id}` | 获取单条日志详情 |
| DELETE | `/api/logs/{id}` | 删除单条日志 |

### 查询参数 (GET /api/logs)

| Parameter | Type | Description |
|-----------|------|-------------|
| ruleId | string | 按规则 ID 过滤 |
| status | string | 按状态过滤 (success/failed/partial) |
| operatorOpenId | string | 按操作人过滤 |
| startDate | string | 开始时间 |
| endDate | string | 结束时间 |
| limit | number | 返回数量，默认 50 |
| offset | number | 偏移量，默认 0 |

### Swagger UI

启动服务后访问：http://localhost:3000/docs

## Database Schema

### bitables 表

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | 主键 |
| app_token | varchar | 飞书多维表格 Token |
| name | varchar | 名称 |
| table_ids | jsonb | 关联的表 ID 列表 |
| created_at | timestamptz | 创建时间 |
| updated_at | timestamptz | 更新时间 |

### rules 表

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | 主键 |
| name | varchar | 规则名称 |
| enabled | boolean | 是否启用 |
| bitable_id | uuid | 关联的多维表格 ID |
| trigger | jsonb | 触发器配置 |
| action | jsonb | 动作配置 |
| on_failure | varchar | 失败策略 (continue/stop) |
| created_at | timestamptz | 创建时间 |
| updated_at | timestamptz | 更新时间 |

### execution_logs 表

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | 主键 |
| rule_id | uuid | 关联的规则 ID |
| rule_name | varchar | 规则名称 |
| trigger_action | varchar | 触发动作 |
| record_id | varchar | 记录 ID |
| operator_openid | varchar | 操作人 Open ID |
| record_snapshot | jsonb | 记录快照 |
| status | varchar | 状态 (success/failed/partial) |
| error_message | text | 错误信息 |
| duration_ms | integer | 执行耗时 |
| response | jsonb | 响应数据 |
| created_at | timestamptz | 创建时间 |

## Testing

```bash
# 运行单元测试
npx tsx tests/engine/condition-evaluator.test.ts
npx tsx tests/actions/action-registry.test.ts

# 运行集成测试
npx tsx tests/integration/event-processing.test.ts
```

## Project Structure

```
src/
├── index.ts              # 应用入口
├── lark.ts               # 飞书事件监听
├── db/
│   ├── client.ts         # Supabase 客户端
│   ├── bitables.ts       # 多维表格数据访问
│   ├── rules.ts          # 规则数据访问
│   └── execution-logs.ts # 执行日志数据访问
├── engine/
│   ├── index.ts          # 规则引擎导出
│   ├── condition-evaluator.ts  # 条件评估器
│   └── event-router.ts   # 事件路由器
└── actions/
    ├── index.ts          # 动作注册
    ├── registry.ts       # 动作执行器
    ├── send-feishu-message.ts
    ├── call-api.ts
    ├── create-record.ts
    ├── update-record.ts
    └── delete-record.ts
```
