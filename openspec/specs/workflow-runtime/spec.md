# workflow-runtime Specification

## Purpose
TBD - created by archiving change migrate-to-workflow-only-with-field-mapping. Update Purpose after archive.
## Requirements
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

### Requirement: Workflow runtime SHALL preserve table-scope matching semantics
The system SHALL preserve table-scope candidate filtering semantics for active workflows.

#### Scenario: Route only table-scoped workflows
- **WHEN** table-scoped workflows are active for an event
- **THEN** the runtime MUST include only table-scoped candidates matching the same `app_token` and `table_id`

#### Scenario: Ignore inactive workflows
- **WHEN** a workflow is marked inactive
- **THEN** the runtime MUST exclude it from candidate execution

### Requirement: Workflow runtime SHALL support core bitable action parity
The workflow plugin system SHALL support core bitable actions required by existing automation behavior, including create/update/delete/query record operations.

#### Scenario: Execute create record action in workflow
- **WHEN** a workflow step is configured as create-record action with valid target table parameters
- **THEN** the runtime MUST create a target record and expose the result in step output

#### Scenario: Execute delete or query action in workflow
- **WHEN** a workflow step is configured as delete-record or query-records action with valid parameters
- **THEN** the runtime MUST execute the corresponding operation and return standardized success or failure result

### Requirement: Workflow runtime failures SHALL be observable and diagnosable
The system SHALL emit execution outcomes and error context for workflow-only runtime operations, and MUST guarantee that rejected executions, transient log-sync failures, and business decision outcomes are observable in persisted execution logs.

#### Scenario: Log step failure with context
- **WHEN** a workflow step execution fails
- **THEN** the system MUST record workflow identity, trigger context, step type, and failure reason in execution logs

#### Scenario: Keep processing boundary clear
- **WHEN** one workflow execution fails for an event
- **THEN** the runtime MUST NOT silently suppress the failure and MUST keep failure visibility for operators

#### Scenario: Persist rejected workflow execution logs
- **WHEN** a workflow execution promise is rejected in runtime orchestration
- **THEN** the system MUST persist a `failed` execution log entry with workflow identity and structured error summary

#### Scenario: Retain logs when batch sync temporarily fails
- **WHEN** execution log batch write to persistence fails due to transient error
- **THEN** the runtime MUST retain the unsynced log batch for retry instead of dropping it

#### Scenario: Drain pending logs before process exit
- **WHEN** runtime receives graceful shutdown signals
- **THEN** it MUST attempt to flush pending execution logs before exit under bounded timeout protection

#### Scenario: Distinguish technical status and business status
- **WHEN** execution is technically successful but business branch is not matched
- **THEN** persisted execution log payload MUST expose business decision status separately from technical execution status

