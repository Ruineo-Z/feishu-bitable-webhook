## Context

当前仓库已完成 workflow-only 运行时收敛，后端 API 与执行引擎稳定可用。相比继续投入重前端方案，本次选择以 Skill + API 的轻量闭环实现自然语言编排：Skill 生成 DSL 草案，后端提供 dry-run 校验能力，发布仍走现有 create/update 接口。

关键约束：
- 业务正确性必须由后端保证，不能依赖 Skill 自觉遵守。
- dry-run 必须复用真实执行链路，仅隔离副作用。
- 首期不新增确认发布专用 API，发布确认由调用方（Skill/业务流程）控制。

## Goals / Non-Goals

**Goals:**
- 建立自然语言编排最小闭环：`generate -> dry-run validate -> fix -> create/update`。
- 定义机器可读错误协议，支撑 Skill 自动修复。
- 让 dry-run 与真实执行保持一致的分支与模板行为。

**Non-Goals:**
- 不建设新的可视化画布编辑器。
- 不在本阶段引入独立 workflow MCP 服务。
- 不新增“确认后发布”专用后端接口与令牌机制。

## Decisions

### 决策 1：NL->DSL 由 Skill 负责，正确性由后端负责
- 方案：Skill 生成候选 DSL，后端 dry-run 校验并返回结构化错误。
- 理由：迭代快，且不会牺牲正确性。

### 决策 2：新增独立 dry-run 接口，不直接改 create/update 行为
- 方案：新增 `POST /api/workflows/dry-run`，发布继续使用现有 `POST/PUT /api/workflows`。
- 理由：最小侵入，迁移成本低，兼容现有工作流管理路径。

### 决策 3：dry-run 复用真实引擎，仅屏蔽外部副作用
- 方案：引擎增加运行模式，插件在 dry-run 下返回预览并记录 effect，不调用真实飞书写操作。
- 理由：保证 dry-run 结果贴近真实执行。

## Risks / Trade-offs

- [风险] Skill 输出偏离节点约束 → [缓解] 后端白名单校验插件类型与 DSL 结构。
- [风险] dry-run 与 live 偏差 → [缓解] 统一引擎路径，仅替换副作用执行分支。
- [风险] 自动修复循环过长 → [缓解] 由 Skill 侧设置最大重试次数并转人工确认。
