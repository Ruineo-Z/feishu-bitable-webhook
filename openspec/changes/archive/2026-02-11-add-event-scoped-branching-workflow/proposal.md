## Why

当前 workflow 的作用域只到 `table`，事件类型过滤依赖 DSL 内部约定且缺少结构化路由字段，导致“命中候选后再跳过”的噪声执行与可观测性混乱。与此同时，现有 DSL 主要是线性步骤，不支持显式 `if/else` 分支，难以承载业务人员在 Web 端进行可视化流程编排。

## What Changes

- 将 workflow 路由语义从 `table` 扩展为 `table + optional eventTypes`：`scope` 继续必填表绑定，`scope.eventTypes` 变为可选过滤条件。
- 在存储层增加事件类型的结构化路由字段，并将候选查询升级为按 `app_token + table_id + event_type` 优先过滤。
- 保持兼容：未配置 `eventTypes` 的 workflow 仍视为“该表全部事件可触发”。
- 扩展 DSL 控制流：支持条件节点显式分支（如 `onTrue` / `onFalse`）与节点跳转（`next`），支持以 DAG 方式表达流程。
- 保持兼容：老的线性 steps DSL 在不改配置的情况下继续可执行。
- 更新管理 API 与 Web UI，支持配置/展示 `scope.eventTypes` 与分支型 DSL（先支持 JSON 编辑与校验，再逐步增强可视化编排体验）。
- 提供迁移与校验策略：从历史 `trigger.config.action/actions` 回填到新路由字段，并在冲突时给出明确报错。

## Capabilities

### New Capabilities
- `workflow-branching-control-flow`: 定义 workflow DSL 的分支控制流语义（条件分支、节点跳转、DAG 校验与兼容行为）。

### Modified Capabilities
- `workflow-scope-routing`: 将路由能力从 table-only 扩展为 table + optional eventTypes，并要求结构化可索引查询。
- `workflow-management-web-ui`: 扩展 UI 的作用域配置与 DSL 编辑能力，支持事件过滤和分支流程配置。
- `api-documentation`: 更新 OpenAPI/Swagger 中 workflow scope 与 DSL 相关契约示例与字段说明。

## Impact

- Affected code:
  - `src/workflow/scope.ts`（scope 模型、兼容转换、回填计划）
  - `src/db/workflows.ts`（候选查询与事件路由字段）
  - `src/lark.ts`（事件过滤、路由兜底、执行日志增强）
  - `src/workflow/dsl/*`、`src/workflow/core/engine.ts`（分支语义、DAG 执行与校验）
  - `src/routes/workflow.ts`（scope/eventTypes 与 DSL 校验）
  - `src/ui/workflows/*`（表单字段、JSON 模板、编辑/展示逻辑）
- Affected data model:
  - `workflows` 表新增或强化事件类型路由字段（如 `trigger_actions`），并补充索引。
- Affected APIs:
  - `POST/PUT/GET /api/workflows` 的 scope 与 DSL schema 响应内容更新。
- Affected operations:
  - 需要迁移脚本与验收清单，确保旧 workflow 行为可回归、可追踪、可回滚。
