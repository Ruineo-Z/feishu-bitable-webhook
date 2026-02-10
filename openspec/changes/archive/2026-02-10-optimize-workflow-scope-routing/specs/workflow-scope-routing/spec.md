## ADDED Requirements

### Requirement: Workflow SHALL declare explicit scope
The system SHALL store workflow scope as explicit structured fields and MUST support `table` and `global` scope types.

#### Scenario: Create table-scoped workflow
- **WHEN** a workflow is created with scope type `table`
- **THEN** the system MUST require valid `app_token` and `table_id` bindings

#### Scenario: Create global workflow
- **WHEN** a workflow is created with scope type `global`
- **THEN** the system MUST mark the workflow as explicitly global without relying on missing binding fields

### Requirement: Event routing SHALL prioritize scope filtering
The system SHALL perform candidate workflow lookup by scope before condition evaluation and step execution.

#### Scenario: Route by table scope
- **WHEN** an event arrives with `app_token` and `table_id`
- **THEN** the system MUST first query active workflows matching the same table scope

#### Scenario: Evaluate only candidate workflows
- **WHEN** scope lookup returns candidate workflows
- **THEN** the system MUST run condition matching and execution only for that candidate set

### Requirement: System SHALL support explicit global workflow matching
The system SHALL include explicitly global active workflows in candidate selection for all events.

#### Scenario: Merge table and global candidates
- **WHEN** an event matches table-scoped workflows and global workflows exist
- **THEN** the candidate set MUST include both table-scoped matches and explicit global workflows

#### Scenario: No implicit global fallback
- **WHEN** a workflow has no explicit scope declaration
- **THEN** the system MUST NOT treat it as global by default in the steady-state model

### Requirement: Workflow routing fields SHALL be queryable and indexable
The system SHALL persist routing-critical scope fields outside free-form workflow config to support indexed lookup.

#### Scenario: Indexed lookup path
- **WHEN** event routing queries active workflows
- **THEN** the query MUST be expressible with structured fields (`is_active`, `scope_type`, `app_token`, `table_id`)

#### Scenario: API write consistency
- **WHEN** a workflow is created or updated through API
- **THEN** scope fields and workflow config MUST remain semantically consistent

### Requirement: Migration SHALL preserve existing workflow behavior predictably
The system SHALL provide a migration path for existing workflows and MUST make migration outcomes auditable.

#### Scenario: Backfill table scope from legacy trigger config
- **WHEN** a legacy workflow includes `trigger.config.app_token` and `trigger.config.table_id`
- **THEN** migration MUST backfill that workflow as `table` scope with the same bindings

#### Scenario: Backfill global scope for unbound legacy workflows
- **WHEN** a legacy workflow lacks table bindings
- **THEN** migration MUST backfill it as explicit `global` scope and record it in migration audit output
