## MODIFIED Requirements

### Requirement: OpenAPI Spec Endpoint
The system MUST expose a `GET /doc` endpoint that reflects scope event filtering and branching workflow DSL contracts.

#### Scenario: Include event-scoped workflow schema
- **WHEN** a client requests `GET /doc`
- **THEN** the returned OpenAPI specification MUST include `scope.eventTypes` field definitions, enum constraints, and compatibility notes

#### Scenario: Include branching DSL schema
- **WHEN** a client requests `GET /doc`
- **THEN** the returned OpenAPI specification MUST include branching control fields (such as `onTrue`, `onFalse`, `next`) and validation constraints

### Requirement: Swagger UI
The system MUST expose a `GET /docs` endpoint and MUST provide documentation guidance for event filtering and branching configuration.

#### Scenario: Display event filter examples
- **WHEN** a user opens Swagger UI
- **THEN** workflow create/update endpoints MUST include request examples for table scope with and without `eventTypes`

#### Scenario: Display branching DSL examples
- **WHEN** a user opens Swagger UI
- **THEN** workflow create/update endpoints MUST include at least one branching DSL request example that demonstrates condition true/false paths

### Requirement: API Descriptions
The system MUST provide meaningful summaries and descriptions for workflow endpoints when introducing new routing and control-flow semantics.

#### Scenario: Explain compatibility semantics
- **WHEN** a user reads endpoint descriptions for workflow APIs
- **THEN** documentation MUST explicitly describe compatibility behavior for workflows without `eventTypes` and for legacy linear steps

#### Scenario: Explain validation failure semantics
- **WHEN** a request contains conflicting scope and trigger event settings
- **THEN** documentation MUST describe validation error behavior and expected correction path
