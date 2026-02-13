## MODIFIED Requirements

### Requirement: OpenAPI Spec Endpoint
The system MUST expose a `GET /doc` endpoint that reflects workflow-only runtime interfaces and field-mapping APIs.

#### Scenario: Include workflow-only and mapping endpoints
- **WHEN** a client requests `GET /doc`
- **THEN** the returned OpenAPI document MUST include workflow management endpoints and field-mapping refresh/query endpoints used by workflow-only runtime

#### Scenario: Remove legacy refresh endpoint from OpenAPI
- **WHEN** a client requests `GET /doc` after workflow-only cutover
- **THEN** the OpenAPI document MUST NOT include legacy bitables refresh endpoint

### Requirement: Swagger UI
The system MUST expose `GET /docs` and provide operation descriptions that guide users to workflow-only usage.

#### Scenario: Display workflow-only guidance
- **WHEN** a user opens Swagger UI
- **THEN** workflow and mapping-related endpoints MUST include clear summaries/descriptions for function and parameters

#### Scenario: Show workflow-only mapping APIs
- **WHEN** users view mapping-related operations in Swagger UI
- **THEN** the documentation MUST only display workflow-only mapping APIs and their parameter descriptions
