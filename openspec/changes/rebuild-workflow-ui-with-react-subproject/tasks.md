## 1. 子项目初始化与构建接入

- [x] 1.1 在 `web/workflow-studio` 初始化 Vite + React + TypeScript 子项目结构
- [x] 1.2 配置子项目基础脚本（dev/build/preview）并补充根目录调用脚本
- [x] 1.3 设计并实现前端构建产物目录与后端静态路由映射策略
- [x] 1.4 在 `src/routes/workflow-ui.ts` 完成 `/ui/workflows` 到新产物入口的接入
- [x] 1.5 增加旧页面回退开关（如 `WORKFLOW_UI_LEGACY`）并验证可切换

## 2. API 与数据模型适配层

- [x] 2.1 在子项目实现 workflow API client（list/detail/create/update/delete）
- [x] 2.2 定义 Visual `FormModel` 类型与默认值工厂
- [x] 2.3 实现 `FormModel -> DSL` 生成器（覆盖 condition/action/branch/when/templatePolicy）
- [x] 2.4 实现 `DSL -> FormModel` 解析器并定义“可视化支持边界”判断
- [x] 2.5 为解析/生成异常提供统一错误码与用户友好文案

## 3. 可视化创建与编辑体验

- [x] 3.1 实现列表页（状态筛选、分页、刷新、删除确认）
- [x] 3.2 实现可视化编辑器基础信息区（名称、启用状态、scope、eventTypes）
- [x] 3.3 实现步骤编辑区（步骤增删、顺序、condition 配置、action 配置）
- [x] 3.4 实现分支配置（`onTrue`/`onFalse`/`next` 目标选择）
- [x] 3.5 实现创建/更新提交链路与提交中禁用逻辑
- [x] 3.6 实现页面视觉 token 系统，并将 `Halo 金青` 设为默认主题
- [x] 3.7 实现主题切换能力（Aero/Quantum/黑金实验档）且保证仅影响展示层
- [x] 3.8 实现关键微动效与可关闭机制（含 reduced-motion 适配）
- [x] 3.9 校验焦点态、对比度与交互反馈，满足可访问性基线

## 4. 高级模式与兼容策略

- [x] 4.1 增加“可视化模式 / 高级 JSON 模式”切换入口
- [x] 4.2 在可视化 -> 高级切换时展示最新生成 DSL
- [x] 4.3 在加载到不可视化 DSL 时自动降级高级模式并提示原因
- [x] 4.4 增加从高级模式回到可视化模式的安全确认与数据保护策略

## 5. 质量验证与文档更新

- [x] 5.1 为 adapter 层补充单元测试（生成/解析/边界 DSL）
- [x] 5.2 为关键页面交互补充测试（创建、编辑、删除、模式切换）
- [x] 5.3 完成 `/ui/workflows` 集成验证并记录回退步骤
- [x] 5.4 更新开发文档（子项目启动、构建、联调与发布流程）
