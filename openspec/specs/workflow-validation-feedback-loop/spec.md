# workflow-validation-feedback-loop Specification

## Purpose
TBD - created by archiving change add-agent-driven-workflow-authoring. Update Purpose after archive.
## Requirements
### Requirement: 校验接口 SHALL 提供结构与语义双重校验
系统 SHALL 在 workflow 发布前执行结构校验（schema、必填项、DAG 合法性）和语义校验（字段存在性、字段类型、模板解析约束）。

#### Scenario: 结构错误拦截
- **WHEN** 候选 DSL 存在循环依赖或缺失必填字段
- **THEN** 系统 MUST 返回失败结果并给出可定位的错误路径

#### Scenario: 语义错误拦截
- **WHEN** 候选 DSL 中字段类型与动作参数不兼容
- **THEN** 系统 MUST 返回失败结果并说明期望类型与实际类型

### Requirement: Dry-run SHALL 不产生外部副作用
系统 SHALL 支持 dry-run 模式模拟工作流执行路径，并保证在 dry-run 中不执行任何外部写入动作。

#### Scenario: Dry-run 命中写动作
- **WHEN** 校验流程在 dry-run 中走到 create/update/delete 等动作步骤
- **THEN** 系统 MUST 仅返回预期行为与参数预览，不得写入外部系统

#### Scenario: Dry-run 返回执行摘要
- **WHEN** dry-run 校验完成
- **THEN** 系统 MUST 返回执行路径、分支决策和潜在风险摘要

### Requirement: 校验错误响应 SHALL 机器可读
系统 SHALL 返回结构化错误数组，至少包含 `code`、`path`、`message` 与 `hint` 字段，供 Agent 自动修复。

#### Scenario: 多错误同时返回
- **WHEN** 候选 DSL 同时存在多个可检测错误
- **THEN** 系统 MUST 返回全部错误条目，且每条错误都包含可定位路径

#### Scenario: 不可自动修复错误
- **WHEN** 错误依赖人工补充业务信息（如目标表缺失）
- **THEN** 系统 MUST 标记该错误不可自动修复并提供人工处理建议

### Requirement: 自动修复循环 SHALL 具备重试边界
系统 SHALL 为 Agent 修复循环设置最大重试次数，并在超过阈值时终止自动循环。

#### Scenario: 达到最大重试次数
- **WHEN** 同一编排请求在连续修复后仍未通过校验
- **THEN** 系统 MUST 终止自动修复并返回“需要人工介入”状态

