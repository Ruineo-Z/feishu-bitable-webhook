## ADDED Requirements

### Requirement: Event processing SHALL execute through workflow-only runtime
The system SHALL process Feishu record-change events exclusively through workflow scope routing and workflow engine execution.

#### Scenario: Route event to workflow candidates
- **WHEN** a record change event is received with `app_token` and `table_id`
- **THEN** the system MUST load candidate workflows by scope and execute matched workflows in the workflow engine

#### Scenario: Do not execute legacy rules in realtime path
- **WHEN** a record change event is handled by the runtime
- **THEN** the system MUST NOT invoke legacy rules matching/execution in the realtime event path

### Requirement: Workflow runtime SHALL preserve scope-based matching semantics
The system SHALL preserve table-scope and global-scope candidate merging semantics for active workflows.

#### Scenario: Merge table and global workflows
- **WHEN** table-scoped workflows and global workflows are both active for an event
- **THEN** the runtime MUST include both candidate sets before step evaluation

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
The system SHALL emit execution outcomes and error context for workflow-only runtime operations.

#### Scenario: Log step failure with context
- **WHEN** a workflow step execution fails
- **THEN** the system MUST record workflow identity, trigger context, step type, and failure reason in execution logs

#### Scenario: Keep processing boundary clear
- **WHEN** one workflow execution fails for an event
- **THEN** the runtime MUST NOT silently suppress the failure and MUST keep failure visibility for operators
