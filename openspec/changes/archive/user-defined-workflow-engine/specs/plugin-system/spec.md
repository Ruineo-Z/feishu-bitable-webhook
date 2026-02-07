# Spec: Plugin System

## Requirements

1.  **Plugin Interface**
    - MUST define `IWorkflowPlugin` interface.
    - MUST require an `execute(context, config)` method.
    - MUST return a standard result object `{ success: boolean, output?: any, error?: string }`.

2.  **Registry**
    - MUST provide a mechanism to register plugins by type name (e.g., `action.feishu.message`).
    - MUST throw an error if a workflow requests an unknown plugin type.

3.  **Standard Plugins**
    - MUST implement `condition.logic` (basic AND/OR/Equals comparisons).
    - MUST implement adapters for existing actions (`action.feishu.message`, `action.bitable.update`).
