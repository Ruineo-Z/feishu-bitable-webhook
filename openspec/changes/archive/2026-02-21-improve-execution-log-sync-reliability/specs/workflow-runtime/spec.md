## MODIFIED Requirements

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
