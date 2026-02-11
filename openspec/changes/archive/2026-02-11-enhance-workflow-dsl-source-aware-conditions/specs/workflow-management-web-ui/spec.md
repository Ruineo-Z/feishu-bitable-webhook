## MODIFIED Requirements

### Requirement: UI SHALL support creating workflows with table scope validation
The workflow management UI SHALL allow users to create workflows via `POST /api/workflows` and MUST validate table scope, optional event filters, branching DSL structure, and source-aware condition fields before submission.

#### Scenario: Configure condition expression source
- **WHEN** a user configures condition expressions in workflow payload
- **THEN** the UI MUST allow selecting `source` (`before` or `after`) and MUST validate value is within supported enum

#### Scenario: Configure step guard and unresolved-template policy
- **WHEN** a user configures an action step
- **THEN** the UI MUST allow optional `when` guard and optional unresolved-template policy field, and MUST validate schema before submit

#### Scenario: Block malformed source-aware DSL
- **WHEN** a user submits DSL with invalid source value, malformed guard condition, or conflicting policy fields
- **THEN** the UI MUST block submission and present clear validation errors

### Requirement: UI SHALL support editing workflows with detail-based loading
The workflow management UI SHALL load workflow details from `GET /api/workflows/{id}` before editing and MUST preserve source-aware condition fields and guard configuration when updating via `PUT /api/workflows/{id}`.

#### Scenario: Load and render source-aware fields
- **WHEN** a user starts editing a workflow that already defines `source` or `when`
- **THEN** the UI MUST prefill those fields with latest server state

#### Scenario: Save source-aware workflow updates
- **WHEN** a user submits valid edited workflow data containing `source`/`when`/policy fields
- **THEN** the UI MUST send complete payload, preserve these fields, and refresh list/detail state on success
