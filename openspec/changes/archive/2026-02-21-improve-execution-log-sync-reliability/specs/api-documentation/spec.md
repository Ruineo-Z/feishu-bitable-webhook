## MODIFIED Requirements

### Requirement: OpenAPI Spec Endpoint
The system MUST expose a `GET /doc` endpoint that reflects source-aware workflow DSL contracts, type-aware condition semantics, query/delete filter operator constraints, step guard, unresolved-template policy, dry-run request-response schema, and execution-log query semantics.

#### Scenario: Include source-aware condition schema
- **WHEN** a client requests `GET /doc`
- **THEN** the returned OpenAPI specification MUST include `condition.expressions[].source` enum definition and default behavior notes

#### Scenario: Include type-aware condition operator matrix
- **WHEN** a client requests `GET /doc`
- **THEN** the returned OpenAPI specification MUST document operator availability by field type for `condition` evaluation (for example text/number/user/multi-select/date/link)

#### Scenario: Include filter operator matrix and limits
- **WHEN** a client requests `GET /doc`
- **THEN** the returned OpenAPI specification MUST distinguish `query/delete filter` operators from `condition` operators and MUST describe current limitations (for example unsupported `like`/`in` and formula non-filterable)

#### Scenario: Include guarded step schema
- **WHEN** a client requests `GET /doc`
- **THEN** the returned OpenAPI specification MUST include optional step-level `when` field schema and validation constraints

#### Scenario: Include unresolved-template policy schema
- **WHEN** a client requests `GET /doc`
- **THEN** the returned OpenAPI specification MUST include unresolved-template policy field definitions and allowed values

#### Scenario: Include dry-run error schema
- **WHEN** a client requests `GET /doc`
- **THEN** the returned OpenAPI specification MUST include structured error fields (`code`, `path`, `message`, `hint`) and dry-run summary fields

#### Scenario: Include logs workflow filter schema
- **WHEN** a client requests `GET /doc`
- **THEN** the returned OpenAPI specification MUST include `GET /api/logs` query schema for workflow-level filtering (for example `workflowId`)

#### Scenario: Include logs business status semantics
- **WHEN** a client requests `GET /doc`
- **THEN** the returned OpenAPI specification MUST describe technical status and business decision status fields in execution log payloads
