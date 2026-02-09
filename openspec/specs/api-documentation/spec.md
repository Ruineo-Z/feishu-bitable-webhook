# Spec: API Documentation

## Requirements

1.  **OpenAPI Spec Endpoint**
    - MUST expose a `GET /doc` endpoint.
    - MUST return a valid OpenAPI 3.0.0 JSON specification.
    - MUST include all registered API routes (Workflows, Logs, etc.).
    - MUST include correct schemas for requests and responses.

2.  **Swagger UI**
    - MUST expose a `GET /docs` endpoint.
    - MUST render the Swagger UI interface.
    - MUST be configured to fetch the spec from `/doc`.

3.  **API Descriptions**
    - MUST add meaningful `summary` and `description` to key API endpoints if missing.
    - MUST group endpoints by tags (e.g., "Workflows", "Logs").
