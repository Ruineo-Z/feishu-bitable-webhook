## ADDED Requirements

### Requirement: Workflow management UI SHALL be accessible from the service
The system SHALL expose a browser-accessible workflow management page in the running service and MUST present core management modules.

#### Scenario: Open workflow management page
- **WHEN** a user visits the configured workflow management page URL
- **THEN** the system MUST render a usable page containing workflow list area and workflow form area

#### Scenario: Show current service connection state
- **WHEN** the page initializes
- **THEN** the page MUST indicate whether workflow data loading succeeds or fails

### Requirement: Workflow list SHALL provide summary visibility and pagination behavior
The workflow management UI SHALL query workflow list data from `GET /api/workflows` and MUST present summary fields required for operational decisions.

#### Scenario: Render workflow summary list
- **WHEN** workflow list data is returned successfully
- **THEN** the UI MUST display at least workflow name, active status, scope type, and update time for each row

#### Scenario: Navigate list pages
- **WHEN** a user changes list pagination parameters (limit/offset)
- **THEN** the UI MUST request and render the corresponding page using backend pagination metadata

### Requirement: UI SHALL support creating workflows with scope-aware validation
The workflow management UI SHALL allow users to create workflows via `POST /api/workflows` and MUST validate key input fields before submission.

#### Scenario: Create table-scoped workflow
- **WHEN** a user submits a new workflow with scope type `table`
- **THEN** the UI MUST require non-empty `appToken` and `tableId` before sending the request

#### Scenario: Create global-scoped workflow
- **WHEN** a user submits a new workflow with scope type `global`
- **THEN** the UI MUST submit payload without table binding fields and show creation feedback from API response

#### Scenario: Block invalid JSON config input
- **WHEN** a user enters malformed JSON for workflow DSL fields
- **THEN** the UI MUST block submission and present a clear validation error message

### Requirement: UI SHALL support editing workflows with detail-based loading
The workflow management UI SHALL load workflow details from `GET /api/workflows/{id}` before editing and MUST update workflows via `PUT /api/workflows/{id}`.

#### Scenario: Load workflow detail for editing
- **WHEN** a user starts editing a workflow from the list
- **THEN** the UI MUST fetch workflow detail and prefill editable fields with the latest server state

#### Scenario: Save workflow updates
- **WHEN** a user submits valid edited workflow data
- **THEN** the UI MUST call update API and refresh list/detail state on success

### Requirement: UI SHALL support deleting workflows with clear confirmation and feedback
The workflow management UI SHALL allow workflow deletion via `DELETE /api/workflows/{id}` and MUST prevent accidental deletion through explicit user confirmation.

#### Scenario: Confirm and delete workflow
- **WHEN** a user confirms deletion for a selected workflow
- **THEN** the UI MUST call delete API and remove the workflow from visible list after success

#### Scenario: Cancel deletion
- **WHEN** a user cancels the deletion confirmation
- **THEN** the UI MUST NOT call delete API and MUST keep current list state unchanged

### Requirement: UI SHALL handle API envelope responses consistently
The workflow management UI SHALL parse API responses using the standardized envelope (`code`, `message`, `data`, `meta`) and MUST present understandable feedback for both success and failure.

#### Scenario: Handle successful API response
- **WHEN** an API call returns a success envelope
- **THEN** the UI MUST show the success `message` and update view data from `data`/`meta`

#### Scenario: Handle failed API response
- **WHEN** an API call returns an error envelope
- **THEN** the UI MUST show error `code` and `message` and keep user context for correction
