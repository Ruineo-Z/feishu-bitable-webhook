# Design: User-Defined Workflow Engine

## Architecture

采用**三层架构**实现配置化工作流引擎：

1.  **适配层 (Adapter Layer)**
    *   **Trigger Adapter**: 负责接收外部事件（如飞书 WebSocket 事件），将其标准化为 `WorkflowContext`。
    *   **Entrypoint**: `src/lark.ts` 将被改造为单纯的 Event Producer，不再包含业务逻辑。

2.  **核心引擎层 (Core Engine Layer)**
    *   **Workflow Loader**: 解析 DSL 配置，构建执行图（DAG 或 Chain）。
    *   **Execution Runtime**: 负责节点调度、状态管理、错误处理。
    *   **Context Manager**: 管理全局上下文（`context.trigger`）和节点输出（`context.steps.<step_id>`）。

3.  **插件层 (Plugin Layer)**
    *   **Standard Interface**: 定义 `IAction`, `ICondition` 接口。
    *   **Registry**: 动态注册可用插件。
    *   **Implementations**: 迁移现有的 `send-feishu-message`, `update-record` 等为插件。

## Data Structures (DSL)

### Workflow Configuration
```typescript
interface WorkflowConfig {
  id: string;
  name: string;
  trigger: {
    type: string; // e.g., 'lark.record.changed'
    config: Record<string, any>;
  };
  steps: WorkflowStep[];
}

interface WorkflowStep {
  id: string;
  type: string; // e.g., 'condition', 'action.http', 'action.lark.message'
  name?: string;
  config: Record<string, any>; // 插件特定的配置
  next?: string; // 下一步的 step_id (支持链式，简单场景)
  // branches?: ... (未来支持分支)
}
```

## Module Design

### `src/workflow/core/`
- `Engine`: 主入口，接收 `EventContext`，查找匹配的 Workflows 并执行。
- `Context`: 强类型的上下文对象，支持 JSON Path 变量解析（如 `${trigger.fields.title}`）。

### `src/workflow/plugins/`
- `PluginRegistry`: 单例模式，管理所有注册的 Capability。
- `BasePlugin`: 抽象基类，提供 `execute(context, config)` 方法。

### `src/workflow/dsl/`
- `Validator`: 使用 Zod 验证 WorkflowConfig 的合法性。

## Integration Strategy

1.  **并行运行**：初期保留旧的 `processEvent` 逻辑。新的 Engine 作为一个独立分支在 `processEvent` 中调用，验证无误后再逐步替换。
2.  **Action 复用**：重构 `src/actions/` 下的代码，使其既能被旧逻辑调用，也能被封装为新插件。

## Database Schema

新增 `workflows` 表（Supabase）：
- `id`: uuid
- `name`: text
- `config`: jsonb (存储 DSL)
- `is_active`: boolean
- `created_at`: timestamp

## Security

- **变量注入防护**：在解析 `${...}` 变量时，确保只访问 Context 内的数据，防止原型链污染。
- **超时控制**：Engine 层级统一控制 Workflow 执行总时长。
