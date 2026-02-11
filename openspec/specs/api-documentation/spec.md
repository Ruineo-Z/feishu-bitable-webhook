# Spec: API Documentation

## Purpose

Define the expected behavior of API documentation endpoints so workflow scope filtering, branching DSL, and compatibility semantics are accurately exposed to developers.
## Requirements
### Requirement: OpenAPI Spec Endpoint
The system MUST expose a `GET /doc` endpoint that reflects source-aware workflow DSL contracts, including condition source, step guard, and unresolved-template policy fields.

#### Scenario: Include source-aware condition schema
- **WHEN** a client requests `GET /doc`
- **THEN** the returned OpenAPI specification MUST include `condition.expressions[].source` enum definition and default behavior notes

#### Scenario: Include guarded step schema
- **WHEN** a client requests `GET /doc`
- **THEN** the returned OpenAPI specification MUST include optional step-level `when` field schema and validation constraints

#### Scenario: Include unresolved-template policy schema
- **WHEN** a client requests `GET /doc`
- **THEN** the returned OpenAPI specification MUST include unresolved-template policy field definitions and allowed values

### Requirement: Swagger UI
The system MUST expose a `GET /docs` endpoint and MUST provide request examples for source-aware conditions and guarded action steps.

#### Scenario: Display source-aware condition example
- **WHEN** a user opens Swagger UI
- **THEN** workflow create/update endpoints MUST include at least one request example using `source: "before"` and `source: "after"`

#### Scenario: Display guarded action example
- **WHEN** a user opens Swagger UI
- **THEN** workflow create/update endpoints MUST include an example showing `when` guard and unresolved-template policy usage

### Requirement: API Descriptions
The system MUST provide meaningful summaries and descriptions for workflow endpoints when introducing new routing and control-flow semantics.

#### Scenario: Explain endpoint purpose and grouping
- **WHEN** a user reads API docs
- **THEN** key endpoints MUST include clear `summary` and `description`, and endpoints MUST be grouped by meaningful tags

#### Scenario: Explain compatibility semantics
- **WHEN** a user reads endpoint descriptions for workflow APIs
- **THEN** documentation MUST explicitly describe compatibility behavior for workflows without `eventTypes` and for legacy linear steps

#### Scenario: Explain validation failure semantics
- **WHEN** a request contains conflicting scope and trigger event settings
- **THEN** documentation MUST describe validation error behavior and expected correction path

