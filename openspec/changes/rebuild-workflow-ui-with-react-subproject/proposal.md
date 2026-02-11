## Why

当前 `/ui/workflows` 是静态 HTML + JSON 文本框编辑模式，业务用户需要直接编写 DSL JSON，学习门槛高、出错率高、反馈也不直观。项目尚未上生产，现在重构为可视化配置 UI 的成本最低，能在上线前显著提升可用性与交付效率。

## What Changes

- 在当前仓库内新增 React 子项目（建议目录 `web/workflow-studio`），用于承载新的 Workflow 配置前端。
- 将“创建/编辑工作流”改为可视化表单与分区配置（触发器、条件、动作、分支），默认不要求用户直接写 JSON。
- 提供“高级模式”用于查看/编辑生成后的 DSL JSON，满足研发排障和高级用户需求。
- 保持与现有 workflow API 兼容，前端负责表单模型与 DSL 的双向映射。
- 替换现有 `/ui/workflows` 管理页实现，移除当前静态页面作为主入口。

## Capabilities

### New Capabilities

- `workflow-visual-builder`: 提供面向业务用户的可视化工作流构建能力，支持在无 JSON 知识下完成触发器、条件分支、动作配置。

### Modified Capabilities

- `workflow-management-web-ui`: 将现有静态管理页升级为 React 子项目驱动的交互式管理台，默认表单化配置并保留高级 JSON 模式。

## Impact

- 影响代码：新增 `web/workflow-studio/**`，调整 `src/routes/workflow-ui.ts` 的静态资源服务逻辑，可能补充构建/启动脚本。
- 影响工程：引入前端子项目依赖与构建产物管理（开发/测试/发布流程需要同步更新）。
- 影响使用方式：业务用户从“手写 JSON”切换到“可视化配置”；研发仍可在高级模式下查看 DSL 细节。
