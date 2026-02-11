## ADDED Requirements

### Requirement: Visual builder SHALL allow non-technical users to create workflows without writing JSON
The system MUST provide a form-driven workflow builder that captures workflow name, activation status, table scope, event types, and step definitions without requiring users to directly edit DSL JSON.

#### Scenario: Create workflow in visual mode
- **WHEN** a user fills out the visual builder form and submits
- **THEN** the UI MUST generate a valid workflow DSL payload and call `POST /api/workflows`

#### Scenario: Block submission when required visual fields are missing
- **WHEN** a user submits visual mode with missing required inputs (such as workflow name or table binding)
- **THEN** the UI MUST prevent submission and show field-level validation errors

### Requirement: Visual builder SHALL support step and branch configuration
The system MUST let users configure condition and action steps in visual mode, including branch targets (`onTrue`/`onFalse`), `when` guards, and template policy options supported by the backend DSL.

#### Scenario: Configure condition branch path
- **WHEN** a user defines a condition step with true and false branches
- **THEN** the UI MUST persist branch targets into generated DSL and preserve them after reload

#### Scenario: Configure action guard and template policy
- **WHEN** a user configures an action step with optional `when` and `templatePolicy`
- **THEN** the UI MUST encode these fields into DSL and validate supported enum values before submit

### Requirement: Visual builder SHALL provide advanced mode interoperability
The system MUST provide an advanced JSON mode for power users and MUST keep visual mode and advanced mode synchronized when the DSL is within supported visual capabilities.

#### Scenario: Switch from visual mode to advanced mode
- **WHEN** a user switches from visual mode to advanced mode
- **THEN** the UI MUST show the latest generated DSL JSON from visual inputs

#### Scenario: Handle unsupported DSL structures in visual mode
- **WHEN** the loaded DSL contains structures not supported by visual mode
- **THEN** the UI MUST keep advanced mode available, show a clear compatibility warning, and prevent destructive visual overwrite without confirmation

### Requirement: Visual builder SHALL provide actionable execution feedback
The system MUST provide clear submission states and result feedback so users can understand whether workflow changes are in progress, successful, or failed.

#### Scenario: Show submitting state
- **WHEN** a create or update request is in progress
- **THEN** the UI MUST disable duplicate submit actions and show an in-progress indicator

#### Scenario: Show success and error feedback
- **WHEN** workflow API returns success or failure
- **THEN** the UI MUST present user-friendly feedback including the backend error code when failure occurs

### Requirement: Visual builder SHALL be guidance-first with advanced mode as secondary
The visual builder MUST open in guided visual mode by default, and MUST keep advanced JSON mode as an optional secondary path for debugging and power users.

#### Scenario: Open editor in visual mode by default
- **WHEN** user enters create or edit workflow page
- **THEN** the UI MUST land in visual mode first and present section-based guidance without requiring JSON input

#### Scenario: Preserve model integrity when switching modes
- **WHEN** user switches between visual mode and advanced JSON mode
- **THEN** the UI MUST preserve synchronized state and MUST warn before any destructive overwrite
