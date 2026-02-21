## MODIFIED Requirements

### Requirement: OpenAPI Spec Endpoint
The system MUST expose a `GET /doc` endpoint that reflects source-aware workflow DSL contracts, type-aware condition semantics, and query/delete filter operator constraints.

#### Scenario: Include source-aware condition schema
- **WHEN** a client requests `GET /doc`
- **THEN** the returned OpenAPI specification MUST include `condition.expressions[].source` enum definition and default behavior notes

#### Scenario: Include type-aware condition operator matrix
- **WHEN** a client requests `GET /doc`
- **THEN** the returned OpenAPI specification MUST document operator availability by field type for `condition` evaluation (for example text/number/user/multi-select/date/link)

#### Scenario: Include filter operator matrix and limits
- **WHEN** a client requests `GET /doc`
- **THEN** the returned OpenAPI specification MUST distinguish `query/delete filter` operators from `condition` operators and MUST describe current limitations (for example unsupported `like`/`in` and formula non-filterable)

#### Scenario: Include dry-run error schema
- **WHEN** a client requests `GET /doc`
- **THEN** the returned OpenAPI specification MUST include structured error fields (`code`, `path`, `message`, `hint`) and dry-run summary fields

### Requirement: Swagger UI
The system MUST expose a `GET /docs` endpoint and MUST provide request examples for source-aware conditions, type-aware comparisons, and filter operator usage.

#### Scenario: Display source-aware condition example
- **WHEN** a user opens Swagger UI
- **THEN** workflow create/update endpoints MUST include at least one request example using `source: "before"` and `source: "after"`

#### Scenario: Display type-aware condition examples
- **WHEN** a user opens Swagger UI
- **THEN** examples MUST include at least one numeric comparison, one user/multi-select contains check, and one empty-value check

#### Scenario: Display filter operator examples
- **WHEN** a user opens Swagger UI
- **THEN** examples MUST show `query/delete filter` usage with `isEmpty`/`isNotEmpty` and number/date comparison operators

### Requirement: API Descriptions
The system MUST provide meaningful summaries and descriptions for workflow endpoints when introducing type-aware condition behavior.

#### Scenario: Explain operator family differences
- **WHEN** a user reads endpoint descriptions for workflow APIs
- **THEN** documentation MUST explicitly describe the difference between `condition` operators and `query/delete filter` operators

#### Scenario: Explain compatibility and fallback semantics
- **WHEN** a user reads endpoint descriptions for workflow APIs
- **THEN** documentation MUST describe fallback behavior when field type metadata is missing and the resulting text-handler evaluation semantics
