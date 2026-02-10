# workflow-scope-routing Specification

## Purpose
定义 workflow 运行时的 table-only 作用域模型，确保事件路由、API 校验与数据模型一致。

## Requirements
### Requirement: Workflow SHALL declare table scope only
The system SHALL store workflow scope as explicit structured fields and MUST only support `table` scope type.

#### Scenario: Create table-scoped workflow
- **WHEN** a workflow is created with scope type `table`
- **THEN** the system MUST require valid `app_token` and `table_id` bindings

#### Scenario: Reject non-table scope
- **WHEN** a workflow payload uses a scope other than `table`
- **THEN** the system MUST reject the request and return a validation error

### Requirement: Event routing SHALL use table scope filtering
The system SHALL perform candidate workflow lookup by table scope before condition evaluation and step execution.

#### Scenario: Route by table scope
- **WHEN** an event arrives with `app_token` and `table_id`
- **THEN** the system MUST query active workflows matching the same table scope only

#### Scenario: Evaluate only candidate workflows
- **WHEN** scope lookup returns candidate workflows
- **THEN** the system MUST run condition matching and execution only for that candidate set

### Requirement: Workflow routing fields SHALL be queryable and indexable
The system SHALL persist routing-critical scope fields outside free-form workflow config to support indexed lookup.

#### Scenario: Indexed lookup path
- **WHEN** event routing queries active workflows
- **THEN** the query MUST be expressible with structured fields (`is_active`, `scope_type`, `app_token`, `table_id`)

#### Scenario: API write consistency
- **WHEN** a workflow is created or updated through API
- **THEN** scope fields and workflow config MUST remain semantically consistent

### Requirement: Migration SHALL preserve table-scoped workflow behavior predictably
The system SHALL provide a migration path for existing workflows and MUST make migration outcomes auditable.

#### Scenario: Backfill table scope from legacy trigger config
- **WHEN** a legacy workflow includes `trigger.config.app_token` and `trigger.config.table_id`
- **THEN** migration MUST backfill that workflow as `table` scope with the same bindings

#### Scenario: Flag unbound legacy workflows for manual migration
- **WHEN** a legacy workflow lacks complete table bindings
- **THEN** migration MUST NOT infer a default global scope and MUST record it in migration audit output
