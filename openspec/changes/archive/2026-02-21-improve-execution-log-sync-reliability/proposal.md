## Why

当前执行日志链路使用“内存队列 + 定时批量写入 Supabase”，在网络抖动、Supabase 短时异常或服务退出时存在日志丢失风险；同时 workflow 执行 `Promise rejected` 仅打印控制台，缺少持久化日志，排障证据不完整。现在系统进入稳定运行阶段，这些可观测性缺口已成为运维风险，需要优先补齐。

## What Changes

- 为执行日志批量写入增加可靠投递机制：失败回队、重试退避、最大重试保护。
- 增加进程退出前日志 drain（`SIGINT`/`SIGTERM`/`beforeExit`），减少内存队列尾部日志丢失。
- 对 workflow 执行阶段 `Promise rejected` 场景补充结构化 `failed` 日志入库。
- 明确区分“技术执行结果”与“业务命中结果”（例如条件未命中），避免仅靠 `status=success` 误判业务成功。
- 优化日志检索能力：引入 `workflow_id` 持久化字段与索引，支持按 workflow 快速筛选。

## Capabilities

### New Capabilities
- `workflow-execution-log-reliability`: 约束执行日志投递可靠性、退出前冲刷与失败补偿策略。

### Modified Capabilities
- `workflow-runtime`: 增强“失败可观测”要求，补齐 rejected 执行与业务状态可见性。
- `api-documentation`: 对齐日志查询与响应语义（`workflow_id` 过滤能力与业务状态字段说明）。

## Impact

- Affected code:
  - `src/lark.ts`
  - `src/db/execution-logs.ts`
  - `src/index.ts`
  - `supabase/migrations/*.sql`
- Affected APIs:
  - `GET /api/logs`（新增或强化按 workflow 维度筛选）
  - 日志详情 `response` 字段语义说明（技术状态 vs 业务状态）
- Affected systems:
  - 事件处理实时链路日志投递
  - Supabase `execution_logs` 表结构与索引
