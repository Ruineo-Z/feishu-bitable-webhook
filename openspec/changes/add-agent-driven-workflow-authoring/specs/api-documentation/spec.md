## MODIFIED Requirements

### Requirement: OpenAPI Spec Endpoint
The system MUST expose a `GET /doc` endpoint that reflects source-aware workflow DSL contracts, including condition source, step guard, unresolved-template policy, and dry-run request-response schema.

#### Scenario: Include source-aware condition schema
- **WHEN** a client requests `GET /doc`
- **THEN** the returned OpenAPI specification MUST include `condition.expressions[].source` enum definition and default behavior notes

#### Scenario: Include guarded step schema
- **WHEN** a client requests `GET /doc`
- **THEN** the returned OpenAPI specification MUST include optional step-level `when` field schema and validation constraints

#### Scenario: Include unresolved-template policy schema
- **WHEN** a client requests `GET /doc`
- **THEN** the returned OpenAPI specification MUST include unresolved-template policy field definitions and allowed values

#### Scenario: Include dry-run error schema
- **WHEN** a client requests `GET /doc`
- **THEN** the returned OpenAPI specification MUST include structured error fields (`code`, `path`, `message`, `hint`) and dry-run summary fields

### Requirement: Swagger UI
The system MUST expose a `GET /docs` endpoint and MUST provide request examples for source-aware conditions, guarded action steps, and dry-run validation flow.

#### Scenario: Display source-aware condition example
- **WHEN** a user opens Swagger UI
- **THEN** workflow create/update endpoints MUST include at least one request example using `source: "before"` and `source: "after"`

#### Scenario: Display guarded action example
- **WHEN** a user opens Swagger UI
- **THEN** workflow create/update endpoints MUST include an example showing `when` guard and unresolved-template policy usage

#### Scenario: Display dry-run validation example
- **WHEN** a user opens Swagger UI
- **THEN** workflow dry-run endpoint MUST include examples covering校验通过与结构化错误返回

### Requirement: API Descriptions
The system MUST provide meaningful summaries and descriptions for workflow endpoints when introducing new routing and control-flow semantics.

#### Scenario: Explain endpoint purpose and grouping
- **WHEN** a user reads API docs
- **THEN** key endpoints MUST include clear `summary` and `description`, and endpoints MUST be grouped by meaningful tags

#### Scenario: Explain compatibility semantics
- **WHEN** a user reads endpoint descriptions for workflow APIs
- **THEN** documentation MUST explicitly describe compatibility behavior for workflows without `eventTypes` and for legacy linear steps

#### Scenario: Explain dry-run validation semantics
- **WHEN** a user reads endpoint descriptions for workflow dry-run API
- **THEN** documentation MUST describe that dry-run does not publish changes and only returns validation and effect previews
