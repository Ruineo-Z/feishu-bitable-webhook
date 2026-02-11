## MODIFIED Requirements

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
