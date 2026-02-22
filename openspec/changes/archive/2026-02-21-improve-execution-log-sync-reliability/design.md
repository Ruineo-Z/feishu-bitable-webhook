## Context

当前日志链路在 `src/lark.ts` 中采用内存队列按 5 秒批量写入 Supabase。该模式吞吐足够，但在两类场景有可靠性缺口：
1) 批量写入失败后日志不会重试，队列已出队的数据直接丢失；
2) 进程退出前没有 drain，最后一个 flush 周期内的日志可能丢失。  
此外，`Promise.allSettled` 的 rejected 项仅打印控制台，未写入 `execution_logs`，导致排障证据不完整；日志查询也缺乏按 workflow 主键维度高效过滤。

## Goals / Non-Goals

**Goals:**
- 保证执行日志在“短时 Supabase 故障 + 服务重启”场景下尽量不丢失。
- 保证 workflow 执行 rejected 场景有结构化失败日志入库。
- 明确日志语义，区分“技术执行成功”和“业务命中成功”。
- 提供按 `workflow_id` 的可检索能力与索引支持。

**Non-Goals:**
- 不引入 Redis/Kafka 等新外部队列系统。
- 不改变 workflow 条件引擎本身的判断逻辑。
- 不在本次变更中重构全部日志模型，仅做最小兼容扩展。

## Decisions

### Decision 1: 批量写入失败回队 + 有界重试
- 方案：`flushExecutionLogs` 失败时将当前批次回插到队列头部；附加重试计数与退避（指数或线性）上限，超过阈值输出高优先级告警。
- 原因：以最小改动补齐当前最主要的数据丢失窗口。
- 备选：本地文件 WAL。
  - 未选原因：实现复杂度高，涉及文件生命周期与恢复流程，超出当前改动范围。

### Decision 2: 增加退出前强制 drain
- 方案：监听 `SIGINT`/`SIGTERM`/`beforeExit`，在超时保护内执行一次 `flushExecutionLogs`。
- 原因：补齐“最后 5 秒”日志丢失窗口，适配容器优雅退出。
- 备选：仅缩短 flush 周期。
  - 未选原因：无法覆盖突然退出场景，且会增加 DB 写入频率。

### Decision 3: rejected 执行统一落库
- 方案：对 `Promise.allSettled` 的 rejected 项构造标准 `failed` 日志（含 workflow id、错误摘要、trigger 上下文）。
- 原因：保证任何执行失败都有持久化记录，避免仅靠 console 排障。
- 备选：仅增强 console 输出。
  - 未选原因：不可检索、不可统计，不满足可观测要求。

### Decision 4: 引入业务状态字段
- 方案：保留 `status` 作为技术态（success/failed/partial），新增 `business_status`（如 matched/not_matched/skipped）写入 `response`；后续可升级为列。
- 原因：兼容现有 schema，同时快速消除“status=success 但业务未命中”的歧义。
- 备选：直接改写 `status` 语义。
  - 未选原因：与历史数据不兼容，且会影响现有查询与告警。

### Decision 5: 增加 workflow_id 持久化与索引
- 方案：在 `execution_logs` 增加 `workflow_id` 列并建索引，`GET /api/logs` 增加对应过滤参数。
- 原因：降低 JSON 字段扫描成本，提升日志检索性能。
- 备选：继续从 `response.workflowId` 查询。
  - 未选原因：查询复杂且无索引，规模上来后性能不可控。

## Risks / Trade-offs

- [失败回队导致队列积压] → 增加队列长度监控与阈值告警，超过上限按策略丢弃最旧并记录告警。  
- [退出 drain 拉长停机时间] → 设置 flush 超时与最大批次，超时后强制退出并上报告警。  
- [新增字段带来兼容成本] → 先做“response 内兼容字段 + DB 可空列”，保持向后兼容。  
- [重试放大 DB 压力] → 使用退避与最大重试次数，避免持续高频重试。  

## Migration Plan

1. 数据库迁移：新增 `execution_logs.workflow_id`（可空）与索引。  
2. 运行时改造：日志 flush 增加失败回队与重试机制。  
3. 生命周期改造：增加进程退出前 drain。  
4. 执行链路改造：补齐 rejected 日志写入；写入 `business_status`。  
5. API 改造：`/api/logs` 支持 `workflowId` 过滤，并更新文档。  
6. 回归验证：模拟 Supabase 写入失败、进程退出、workflow rejected 三类场景。  

回滚策略：
- 可先回退代码层（禁用重试/业务状态扩展），DB 新增列保持兼容不影响旧逻辑。

## Open Questions

- `business_status` 是否需要直接入表列，还是先保持在 `response` 内观测一段时间？
- `workflow_id` 是否需要外键约束到 `workflows.id`（若有跨环境迁移，外键可能带来耦合）？
- 日志重试失败告警是走现有日志系统，还是追加 webhook/消息通知？
