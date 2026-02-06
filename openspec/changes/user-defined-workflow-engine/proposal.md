## Why

当前系统的业务逻辑（触发条件、执行动作）主要通过硬编码或简单的数据库规则实现，扩展性和灵活性受限。为了支持更复杂的业务场景，并最终允许用户自定义工作流（User-Defined Workflows），我们需要构建一个通用的、可配置的工作流引擎。这将把“业务逻辑”与“执行引擎”解耦，使系统能够通过加载配置（DSL）来运行，为未来开发可视化编排界面打下基础。

## What Changes

- **核心引擎重构**：从硬编码的 `Event -> Rule -> Actions` 模式转变为基于图（Graph）或链（Chain）的通用工作流引擎。
- **配置化定义 (DSL)**：设计一套标准的数据结构（JSON/YAML Schema）来描述工作流，包含触发器、条件节点、动作节点及其连接关系。
- **插件化架构**：将现有的 Action 和 Condition 封装为标准插件，使其可以动态注册并在工作流中被引用。
- **上下文传递**：实现节点间的数据传递机制，允许后续节点使用前序节点的输出。

## Capabilities

### New Capabilities
- `workflow-engine`: 负责加载、解析和执行用户定义的工作流配置。支持节点调度和上下文管理。
- `workflow-dsl`: 定义工作流的配置协议（Schema），描述触发器、节点类型、参数及连接关系。
- `plugin-system`: 标准化的插件接口，用于注册和管理 Trigger、Condition 和 Action。

### Modified Capabilities
- `event-listener`: (修改现有 `src/lark.ts`) 不再直接处理业务逻辑，而是作为适配器将外部事件转换为标准引擎事件。

## Impact

- **新增目录**: `src/workflow/` (核心引擎), `src/plugins/` (插件实现)。
- **数据迁移**: 现有的 `rules` 表可能需要迁移到新的 `workflows` 表结构，或者设计兼容层。
- **API 变更**: 需要提供新的 API 用于验证和提交工作流配置。
