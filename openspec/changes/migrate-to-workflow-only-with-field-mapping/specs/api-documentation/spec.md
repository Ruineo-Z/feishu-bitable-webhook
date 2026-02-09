## MODIFIED Requirements

### Requirement: OpenAPI Spec Endpoint
The system MUST expose a `GET /doc` endpoint that reflects workflow-only runtime interfaces and field-mapping APIs.

#### Scenario: Include workflow-only and mapping endpoints
- **WHEN** a client requests `GET /doc`
- **THEN** the returned OpenAPI document MUST include workflow management endpoints and field-mapping refresh/query endpoints used by workflow-only runtime

#### Scenario: Mark legacy endpoint transition status
- **WHEN** legacy bitables refresh endpoint is still present during transition
- **THEN** the OpenAPI document MUST clearly mark it as deprecated or replacement-targeted

### Requirement: Swagger UI
The system MUST expose `GET /docs` and provide operation descriptions that guide users to workflow-only usage.

#### Scenario: Display workflow-only guidance
- **WHEN** a user opens Swagger UI
- **THEN** workflow and mapping-related endpoints MUST include clear summaries/descriptions for function and parameters

#### Scenario: Reflect replacement path
- **WHEN** users view mapping-related operations in Swagger UI
- **THEN** the documentation MUST indicate the replacement relationship from legacy bitables refresh flow to mapping registry flow
