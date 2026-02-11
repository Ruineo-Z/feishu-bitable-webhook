## MODIFIED Requirements

### Requirement: UI SHALL support creating workflows with table scope validation
The workflow management UI SHALL allow users to create workflows via `POST /api/workflows` and MUST provide visual-form-first configuration for table scope, event filters, branching DSL structure, and source-aware condition fields before submission.

#### Scenario: Create workflow via visual form without writing JSON
- **WHEN** a user creates a workflow through visual form controls
- **THEN** the UI MUST generate valid DSL payload and submit it without requiring manual JSON editing

#### Scenario: Configure condition expression source
- **WHEN** a user configures condition expressions in workflow payload
- **THEN** the UI MUST allow selecting `source` (`before` or `after`) and MUST validate value is within supported enum

#### Scenario: Configure step guard and unresolved-template policy
- **WHEN** a user configures an action step
- **THEN** the UI MUST allow optional `when` guard and optional unresolved-template policy field, and MUST validate schema before submit

#### Scenario: Block malformed source-aware DSL
- **WHEN** generated or edited DSL contains invalid source value, malformed guard condition, or conflicting policy fields
- **THEN** the UI MUST block submission and present clear validation errors

### Requirement: UI SHALL support editing workflows with detail-based loading
The workflow management UI SHALL load workflow details from `GET /api/workflows/{id}` before editing and MUST preserve source-aware condition fields and guard configuration when updating via `PUT /api/workflows/{id}` across visual and advanced modes.

#### Scenario: Load and render source-aware fields
- **WHEN** a user starts editing a workflow that already defines `source` or `when`
- **THEN** the UI MUST prefill those fields with latest server state

#### Scenario: Save source-aware workflow updates
- **WHEN** a user submits valid edited workflow data containing `source`/`when`/policy fields
- **THEN** the UI MUST send complete payload, preserve these fields, and refresh list/detail state on success

#### Scenario: Fallback to advanced mode for unsupported structures
- **WHEN** loaded workflow DSL exceeds visual-mode support boundaries
- **THEN** the UI MUST notify user and keep editing available through advanced JSON mode without data loss

## ADDED Requirements

### Requirement: UI SHALL support replacing legacy static implementation with React subproject
The workflow management UI MUST be delivered from a React subproject build output and exposed through the existing `/ui/workflows` entry so users access a single maintained interface.

#### Scenario: Serve React build at existing UI entry
- **WHEN** a user visits `/ui/workflows`
- **THEN** the system MUST serve the React-based workflow management UI instead of legacy static page assets

#### Scenario: Keep existing workflow API contract
- **WHEN** the React UI performs list/create/update/delete operations
- **THEN** it MUST use existing `/api/workflows` contract without requiring backend API version changes

### Requirement: UI SHALL provide a light-first tech visual style with Halo as default
The workflow management UI MUST use a light-first visual language and MUST set `Halo 金青` as the default tone, so the interface is both modern and readable for business users.

#### Scenario: Use Halo tone by default at workflow entry
- **WHEN** a user first visits `/ui/workflows`
- **THEN** the UI MUST render with `Halo 金青` as the default visual tone

#### Scenario: Allow tone switching without affecting workflow data
- **WHEN** a user switches among available visual tones
- **THEN** the UI MUST only change presentation style and MUST NOT alter form state or workflow payload data

### Requirement: UI SHALL provide lively interactions with accessibility guardrails
The workflow management UI MUST provide controlled micro-interactions to improve perceived quality, while preserving accessibility via reduced-motion and clear focus/contrast rules.

#### Scenario: Respect reduced-motion preferences
- **WHEN** user enables reduced-motion preference (system or in-page toggle)
- **THEN** the UI MUST reduce or disable non-essential animations (including parallax/continuous pulse effects)

#### Scenario: Keep interaction feedback accessible
- **WHEN** user navigates interactive controls (buttons, chips, inputs)
- **THEN** the UI MUST show visible focus states and keep text contrast within readable thresholds for light and dark tones
