## 1. 日志持久化可靠性（P0）

- [x] 1.1 在 `src/lark.ts` 为批量写入失败增加“失败批次回队 + 重试退避 + 最大重试阈值”机制
- [x] 1.2 为日志队列增加容量告警与丢弃策略诊断字段，避免静默丢弃
- [x] 1.3 补充单元/集成测试：模拟 Supabase 暂时失败后日志可重试成功落库

## 2. 进程退出前 drain（P0）

- [x] 2.1 增加 `SIGINT`/`SIGTERM`/`beforeExit` 钩子，退出前触发 `flushExecutionLogs`
- [x] 2.2 增加 drain 超时保护与超时日志告警
- [x] 2.3 补充测试：模拟退出流程，验证 pending 日志在超时内可落库

## 3. rejected 执行可观测性（P1）

- [x] 3.1 在 `Promise.allSettled` 的 rejected 分支补写 `execution_logs` failed 记录
- [x] 3.2 统一 rejected 日志字段（workflow identity、错误摘要、traceId、trigger_action）
- [x] 3.3 补充测试：构造插件抛异常，验证 `/api/logs` 可查询到失败记录

## 4. 日志语义与检索增强（P1/P2）

- [x] 4.1 在日志 payload 增加 `business_status`（例如 matched/not_matched/skipped）并保持 `status` 技术语义不变
- [x] 4.2 新增数据库迁移：`execution_logs.workflow_id` 可空列与索引
- [x] 4.3 在日志写入链路持久化 `workflow_id`，并支持 `GET /api/logs` 按 `workflowId` 过滤

## 5. 文档与回归验证

- [x] 5.1 更新 `src/index.ts` OpenAPI 文档：日志查询新增筛选字段与状态语义说明
- [x] 5.2 增加日志接口回归测试：列表筛选、详情字段、失败场景可见性
- [x] 5.3 在预发执行三类验收（Supabase 瞬断、优雅退出、rejected 异常）并记录结果

> 备注：2026-02-21 已执行 `test:workflow:log-reliability` + `test:workflow:logs-route`，覆盖 Supabase 瞬断重试、优雅退出 drain、rejected 异常可观测与日志接口可见性，详见 `openspec/changes/improve-execution-log-sync-reliability/verification.md`。
