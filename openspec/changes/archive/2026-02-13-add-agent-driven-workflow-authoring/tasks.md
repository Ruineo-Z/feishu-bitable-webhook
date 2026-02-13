## 1. API 契约与路由扩展

- [x] 1.1 在 `src/routes/workflow-authoring.ts` 定义 dry-run 请求与响应 schema（含结构化错误字段）
- [x] 1.2 保持 workflow 创建/更新接口为发布入口，不新增发布专用接口
- [ ] 1.3 在 OpenAPI 注解中补齐 dry-run 的 summary、description 与示例

## 2. 校验与 dry-run 闭环实现

- [x] 2.1 实现 DSL 结构校验与语义校验聚合器（schema、DAG、字段类型、模板变量）
- [x] 2.2 实现 dry-run 执行模式并隔离外部副作用（仅返回执行摘要与风险）
- [x] 2.3 实现统一结构化错误构建器（`code`/`path`/`message`/`hint`/`retryable`）

## 3. Agent 协作与稳定性保障

- [x] 3.1 定义 Agent 输出 DSL 的约束模板（节点白名单、字段模板语法、禁止项）
- [ ] 3.2 定义自动修复循环策略（最大重试次数、超限转人工）
- [ ] 3.3 增加 Agent 调用示例与失败恢复流程说明（面向业务使用手册）

## 4. 测试与验收

- [x] 4.1 增加 dry-run 单元测试与接口测试（覆盖成功、结构错误、语义错误）
- [x] 4.2 增加 dry-run 路由测试（错误返回与成功路径）
- [x] 4.3 更新 README 与 API 文档，补齐自然语言编排闭环的验收示例
