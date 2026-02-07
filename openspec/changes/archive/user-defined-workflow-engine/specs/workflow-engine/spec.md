# Spec: Workflow Engine Core

## Requirements

1.  **Engine Initialization**
    - MUST provide `WorkflowEngine` class that can be instantiated.
    - MUST support loading workflow definitions from JSON objects.

2.  **Execution Model**
    - MUST accept an initial `TriggerContext` (data from the event source).
    - MUST execute steps in the order defined by the configuration.
    - MUST pass a `WorkflowContext` between steps.
    - MUST support "stop" or "fail" signals from steps to terminate execution.

3.  **Variable Substitution**
    - MUST support referencing context data in step configurations using `${path.to.value}` syntax.
    - MUST support accessing trigger data (e.g., `${trigger.record.fields.Title}`).
    - MUST support accessing previous step outputs (e.g., `${steps.step_1.response.id}`).

4.  **Error Handling**
    - MUST catch exceptions thrown by steps.
    - MUST log execution errors with trace IDs.
    - MUST default to stopping workflow on error (unless error handling config is added later).
