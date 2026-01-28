## ADDED Requirements

### Requirement: Log Entry Creation

The system SHALL create a log entry for every rule execution attempt.

#### Scenario: Log successful execution

- **WHEN** a rule action is executed successfully
- **THEN** the system SHALL create a log entry in the `execution_logs` table
- **AND** set status to "success"
- **AND** record the duration in milliseconds
- **AND** store the response from the action (if any)

#### Scenario: Log failed execution

- **WHEN** a rule action execution fails
- **THEN** the system SHALL create a log entry in the `execution_logs` table
- **AND** set status to "failed"
- **AND** record the error message
- **AND** record the duration in milliseconds

#### Scenario: Log partial execution

- **WHEN** a rule has multiple actions and some succeed while others fail
- **THEN** the system SHALL create a log entry with status "partial"
- **AND** record details of which actions succeeded/failed

### Requirement: Trigger Information Capture

The system SHALL capture comprehensive trigger information for each log entry.

#### Scenario: Capture basic trigger info

- **WHEN** creating a log entry
- **THEN** the system SHALL record the rule_id and rule_name
- **AND** record the trigger action type (record_added/edited/deleted)
- **AND** record the affected record_id
- **AND** record the operator's open_id

#### Scenario: Capture record snapshot

- **WHEN** creating a log entry
- **THEN** the system SHALL capture a snapshot of the record at trigger time
- **AND** store the complete fields object
- **AND** store the record_id and any other identifiers

#### Scenario: Capture operator details

- **WHEN** an event is received
- **THEN** the system SHALL extract the operator_id from the event payload
- **AND** store the open_id in the log entry
- **AND** if available, store additional operator information

### Requirement: Performance Metrics

The system SHALL track and record execution performance metrics.

#### Scenario: Measure execution duration

- **WHEN** an action starts executing
- **THEN** the system SHALL record the start timestamp
- **AND** when execution completes, calculate the duration
- **AND** store the duration in milliseconds

#### Scenario: Record response data

- **WHEN** an action returns a response (e.g., message ID, API response)
- **THEN** the system SHALL store the relevant response data
- **AND** make it available for reference in the log

### Requirement: Log Query

The system SHALL provide capabilities to query execution logs.

#### Scenario: Query logs by rule

- **WHEN** querying logs filtered by rule_id
- **THEN** the system SHALL return all log entries for that rule
- **AND** order by creation time descending

#### Scenario: Query logs by status

- **WHEN** querying logs filtered by status (success/failed/partial)
- **THEN** the system SHALL return only logs matching the status
- **AND** order by creation time descending

#### Scenario: Query logs by date range

- **WHEN** querying logs with a date range
- **THEN** the system SHALL return logs within the specified range
- **AND** support both start and end timestamps

#### Scenario: Query logs by operator

- **WHEN** querying logs filtered by operator open_id
- **THEN** the system SHALL return all actions triggered by that operator
- **AND** order by creation time descending

### Requirement: Log Retention

The system SHALL manage log retention appropriately.

#### Scenario: Automatic log pruning

- **WHEN** logs exceed a configurable retention period
- **THEN** the system SHALL delete or archive old logs
- **AND** preserve recent logs for debugging

#### Scenario: Manual log deletion

- **WHEN** an administrator requests to delete logs
- **THEN** the system SHALL remove the specified log entries
- **AND** preserve referential integrity with rules table

#### Scenario: Archive logs

- **WHEN** logs need to be preserved beyond normal retention
- **THEN** the system SHALL support exporting logs to external storage
- **AND** maintain metadata for imported archives
