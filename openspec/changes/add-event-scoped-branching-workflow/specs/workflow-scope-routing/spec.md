## MODIFIED Requirements

### Requirement: Workflow SHALL declare table scope only
The system SHALL store workflow scope as explicit structured fields and MUST only support `table` scope type, with optional event filtering under the same scope.

#### Scenario: Create table-scoped workflow with event filters
- **WHEN** a workflow is created with scope type `table` and optional `eventTypes`
- **THEN** the system MUST require valid `app_token` and `table_id` bindings and MUST validate `eventTypes` values against supported event enums

#### Scenario: Create table-scoped workflow without event filters
- **WHEN** a workflow is created with scope type `table` and no `eventTypes`
- **THEN** the system MUST treat the workflow as matching all supported record-change events for that table

#### Scenario: Reject non-table scope
- **WHEN** a workflow payload uses a scope other than `table`
- **THEN** the system MUST reject the request and return a validation error

### Requirement: Event routing SHALL use table scope filtering
The system SHALL perform candidate workflow lookup by table scope and SHALL narrow candidates by event type before condition evaluation and step execution.

#### Scenario: Route by table scope and event type
- **WHEN** an event arrives with `app_token`, `table_id`, and event type
- **THEN** the system MUST query active workflows matching table scope and MUST include only workflows whose event filter is empty or explicitly includes that event type

#### Scenario: Evaluate only routed candidates
- **WHEN** route lookup returns candidate workflows
- **THEN** the system MUST run condition matching and execution only for that routed candidate set

### Requirement: Workflow routing fields SHALL be queryable and indexable
The system SHALL persist routing-critical fields outside free-form workflow config to support indexed lookup for table and optional event filtering.

#### Scenario: Indexed lookup path with event filter
- **WHEN** event routing queries active workflows
- **THEN** the query MUST be expressible with structured fields (`is_active`, `scope_type`, `app_token`, `table_id`) and optional structured event filter field

#### Scenario: API write consistency
- **WHEN** a workflow is created or updated through API
- **THEN** scope fields, structured event filter fields, and workflow trigger config MUST remain semantically consistent

### Requirement: Migration SHALL preserve table-scoped workflow behavior predictably
The system SHALL provide a migration path for existing workflows and MUST make migration outcomes auditable for both table scope and event filter semantics.

#### Scenario: Backfill event filter from legacy trigger config
- **WHEN** a legacy workflow defines trigger action semantics in `trigger.config.action` or `trigger.config.actions`
- **THEN** migration MUST backfill corresponding structured event filter fields with normalized event type values

#### Scenario: Keep wildcard semantics for legacy workflows without action filter
- **WHEN** a legacy workflow has table binding but no explicit trigger action filter
- **THEN** migration MUST preserve wildcard event matching semantics and record this behavior in migration audit output
