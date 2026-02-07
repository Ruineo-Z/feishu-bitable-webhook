# Spec: Workflow Management API

## Requirements

1.  **List Workflows**
    - MUST implement `GET /api/workflows`
    - MUST support pagination (limit, offset)
    - MUST support filtering by `isActive`
    - MUST return a JSON array of workflow metadata (id, name, isActive, createdAt, updatedAt)

2.  **Get Workflow**
    - MUST implement `GET /api/workflows/:id`
    - MUST return 404 if not found
    - MUST return the full configuration (DSL) in the response

3.  **Create Workflow**
    - MUST implement `POST /api/workflows`
    - MUST validate the request body against `WorkflowConfigSchema`
    - MUST generate a unique ID for the workflow if not provided
    - MUST default `isActive` to true if not specified
    - MUST return 201 Created and the created workflow

4.  **Update Workflow**
    - MUST implement `PUT /api/workflows/:id`
    - MUST return 404 if not found
    - MUST support updating `name`, `config`, and `isActive`
    - MUST re-validate `config` if provided

5.  **Delete Workflow**
    - MUST implement `DELETE /api/workflows/:id`
    - MUST return 204 No Content on success (or 200)
    - MUST return 404 if not found
