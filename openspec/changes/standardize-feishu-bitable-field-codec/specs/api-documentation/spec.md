## MODIFIED Requirements

### Requirement: OpenAPI Spec Endpoint
The system MUST expose a `GET /doc` endpoint that reflects workflow field codec and value normalization contracts.

#### Scenario: Return complete OpenAPI specification
- **WHEN** a client requests `GET /doc`
- **THEN** the endpoint MUST return a valid OpenAPI 3.0.0 JSON specification that includes all registered API routes and correct schemas

#### Scenario: Include codec-aware payload rules
- **WHEN** a client requests `GET /doc`
- **THEN** the returned OpenAPI specification MUST describe field value normalization rules for text, user, and filter payloads in workflow-related schemas

#### Scenario: Include branching and event-scope schema
- **WHEN** a client requests `GET /doc`
- **THEN** the returned OpenAPI specification MUST still include event scope (`scope.eventTypes`) and branching control fields (`onTrue`, `onFalse`, `next`) with validation constraints

### Requirement: Swagger UI
The system MUST expose a `GET /docs` endpoint and MUST provide executable examples for codec-aware workflow configuration.

#### Scenario: Render Swagger UI with /doc source
- **WHEN** a user opens `GET /docs`
- **THEN** the system MUST render Swagger UI and configure it to fetch specification from `/doc`

#### Scenario: Display codec conversion examples
- **WHEN** a user opens workflow create/update API docs
- **THEN** examples MUST cover at least one text field conversion case and one user field conversion case

#### Scenario: Display filter encoding examples
- **WHEN** a user opens workflow action examples
- **THEN** documentation MUST include a filter payload example that demonstrates runtime-encoded value expectations

### Requirement: API Descriptions
The system MUST provide diagnosable descriptions for codec-related failures and correction guidance.

#### Scenario: Explain codec failure semantics
- **WHEN** a user reads workflow error response documentation
- **THEN** docs MUST explain codec-related error codes and field-level diagnostics payload structure

#### Scenario: Explain troubleshooting path
- **WHEN** API call fails with Feishu SDK validation error
- **THEN** docs MUST describe how to use returned `code`, `msg`, and `log_id` for troubleshooting
