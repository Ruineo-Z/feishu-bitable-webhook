# Spec: Workflow DSL

## Requirements

1.  **Configuration Schema**
    - MUST define a Zod schema for `WorkflowConfig`.
    - MUST require `id`, `name`, `trigger`, and `steps`.

2.  **Trigger Definition**
    - MUST include `type` (identifying the event source).
    - MUST include `config` (source-specific filtering rules).

3.  **Step Definition**
    - MUST include `id` (unique within the workflow).
    - MUST include `type` (identifying the plugin to use).
    - MUST include `config` (plugin-specific parameters).
    - MAY include `next` (ID of the following step).

4.  **Validation**
    - MUST validate that `next` references exist.
    - MUST validate that required plugin configs are present (delegated to plugin validators).
