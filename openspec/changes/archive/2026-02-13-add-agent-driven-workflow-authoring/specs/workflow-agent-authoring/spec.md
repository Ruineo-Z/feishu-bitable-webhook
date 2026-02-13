## ADDED Requirements

### Requirement: Agent 编排输入 SHALL 生成受约束的候选 Workflow DSL
系统 SHALL 支持将自然语言需求转换为候选 Workflow DSL，并且候选 DSL 必须满足既有工作流结构约束（触发器、步骤类型、分支连线、字段模板语法）。

#### Scenario: 生成新工作流草案
- **WHEN** 用户输入“按某表事件创建新工作流”的自然语言需求
- **THEN** 系统 MUST 返回可用于后续校验的候选 DSL，并包含名称、scope、trigger、steps 等完整结构

#### Scenario: 生成结果超出允许节点范围
- **WHEN** Skill 生成了未注册的步骤类型或非法控制流字段
- **THEN** 系统 MUST 拒绝该候选 DSL 并返回结构化错误，不得进入发布流程

### Requirement: Agent 编排流程 SHALL 支持已有 Workflow 的定向修改
系统 SHALL 支持基于现有 workflow 进行增量修改，并在结果中明确标识增删改的步骤与配置差异。

#### Scenario: 修改指定工作流配置
- **WHEN** 用户请求“修改某 workflow 的条件和动作参数”
- **THEN** 系统 MUST 基于目标 workflow 生成更新后的候选 DSL，而不是创建新的无关 workflow

#### Scenario: 目标工作流不存在
- **WHEN** 用户请求修改不存在的 workflow 标识
- **THEN** 系统 MUST 返回目标不存在错误，并提示用户选择有效 workflow

### Requirement: 发布流程 SHALL 复用现有创建与更新接口
系统 SHALL 在 dry-run 校验通过后，继续通过现有 workflow 创建/更新接口完成发布。

#### Scenario: 创建发布
- **WHEN** 候选 DSL dry-run 校验通过且用户确认发布
- **THEN** 系统 MUST 通过 `POST /api/workflows` 完成创建

#### Scenario: 更新发布
- **WHEN** 候选 DSL dry-run 校验通过且用户确认发布
- **THEN** 系统 MUST 通过 `PUT /api/workflows/{id}` 完成更新
