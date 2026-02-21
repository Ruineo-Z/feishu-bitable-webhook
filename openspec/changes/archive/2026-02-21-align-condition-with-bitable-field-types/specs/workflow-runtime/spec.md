## MODIFIED Requirements

### Requirement: Event processing SHALL execute through workflow-only runtime
The system SHALL process Feishu record-change events exclusively through workflow scope routing and workflow engine execution, and MUST provide field type metadata for condition evaluation in the same runtime path.

#### Scenario: Route event to workflow candidates
- **WHEN** a record change event is received with `app_token` and `table_id`
- **THEN** the system MUST load candidate workflows by scope and execute matched workflows in the workflow engine

#### Scenario: Do not execute legacy rules in realtime path
- **WHEN** a record change event is handled by the runtime
- **THEN** the system MUST NOT invoke legacy rules matching/execution in the realtime event path

#### Scenario: Build type-aware condition evaluation context
- **WHEN** runtime prepares condition evaluation context for a workflow triggered by record change
- **THEN** it MUST include field type mapping derived from table field schema so condition expressions can use type-aware handlers
