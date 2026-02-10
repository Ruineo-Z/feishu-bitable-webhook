## MODIFIED Requirements

### Requirement: UI SHALL support creating workflows with table scope validation
The workflow management UI SHALL allow users to create workflows via `POST /api/workflows` and MUST validate table scope, optional event filters, and branching DSL structure before submission.

#### Scenario: Create table-scoped workflow with optional event filters
- **WHEN** a user submits a new workflow with scope type `table`
- **THEN** the UI MUST require non-empty `appToken` and `tableId`, and MUST allow optional `eventTypes` selection

#### Scenario: Block invalid event filter values
- **WHEN** a user enters unsupported event type values in workflow payload
- **THEN** the UI MUST block submission and present a clear validation error message

#### Scenario: Block malformed branching DSL
- **WHEN** a user submits DSL containing invalid node references or malformed branch fields
- **THEN** the UI MUST block submission and present a clear validation error message

### Requirement: UI SHALL support editing workflows with detail-based loading
The workflow management UI SHALL load workflow details from `GET /api/workflows/{id}` before editing and MUST preserve event filter and branching configuration when updating via `PUT /api/workflows/{id}`.

#### Scenario: Load workflow detail including event filters
- **WHEN** a user starts editing a workflow from the list
- **THEN** the UI MUST fetch workflow detail and prefill scope fields including `eventTypes`

#### Scenario: Save branching workflow updates
- **WHEN** a user submits valid edited workflow data with branching nodes
- **THEN** the UI MUST call update API and preserve branching-related fields in payload

### Requirement: Workflow list SHALL provide summary visibility and pagination behavior
The workflow management UI SHALL query workflow list data from `GET /api/workflows` and MUST present summary fields required for operational decisions, including trigger range summary.

#### Scenario: Render workflow summary with event filter hint
- **WHEN** workflow list data is returned successfully
- **THEN** the UI MUST display workflow name, active status, scope type, and event filter summary for each row

#### Scenario: Navigate list pages
- **WHEN** a user changes list pagination parameters (limit/offset)
- **THEN** the UI MUST request and render the corresponding page using backend pagination metadata
