## Why

当前工作流配置仍主要面向技术人员，业务同学需要更低门槛的自然语言编排入口。我们已经确认 workflow-only 运行链路稳定，因此优先建设“Skill 生成 DSL + dry-run 校验 + 现有 create/update 发布”的最小闭环，在保证正确性的前提下降低使用成本。

## What Changes

- 引入 Agent/Skill 驱动编排流程：由 Skill 根据自然语言生成候选 DSL。
- 新增 workflow dry-run 校验接口：返回结构化错误与执行预览，不产生外部副作用。
- 保持发布动作走现有工作流管理接口：校验通过后继续调用 `/api/workflows` 与 `/api/workflows/:id` 创建或更新。
- 定义闭环边界：Skill 负责意图理解与 DSL 草案，后端负责 schema/语义/字段编解码正确性。
- 更新 API 文档：补充 dry-run 请求响应、错误模型与推荐调用顺序。

## Capabilities

### New Capabilities
- `workflow-agent-authoring`: 定义 Skill 自然语言编排到候选 DSL 的交互约束与输入输出。
- `workflow-validation-feedback-loop`: 定义 dry-run 校验、结构化错误返回与二次修复循环能力。

### Modified Capabilities
- `api-documentation`: 更新 workflow API 文档，补充 dry-run 语义与错误模型。

## Impact

- Affected code:
  - `src/routes/workflow-authoring.ts`（新增 dry-run 校验接口）
  - `src/workflow/core/*`（支持 dry-run 执行模式）
  - `src/workflow/plugins/*`（动作插件 dry-run 无副作用执行）
  - `tests/workflow/*`（新增 dry-run 与编排闭环测试）
- Affected APIs:
  - 新增 `POST /api/workflows/dry-run`
  - 继续复用 `POST /api/workflows`、`PUT /api/workflows/:id` 进行发布
- Affected systems:
  - Skill 侧需按结构化错误协议进行修复重试与人工确认
