# Design: Workflow API

## Architecture

基于 Hono 和 Zod-OpenAPI 构建 RESTful 接口，复用现有的数据库层和 DSL 定义。

## API Endpoints

### 1. List Workflows
- **Method**: `GET /api/workflows`
- **Query Params**:
  - `isActive`: boolean (optional)
  - `limit`: number (default 50)
  - `offset`: number (default 0)
- **Response**: List of workflows (metadata + summary)

### 2. Get Workflow
- **Method**: `GET /api/workflows/:id`
- **Response**: Full workflow configuration

### 3. Create Workflow
- **Method**: `POST /api/workflows`
- **Body**:
  - `name`: string
  - `config`: `WorkflowConfig` (DSL)
  - `isActive`: boolean
- **Validation**:
  - Must validate `config` against `WorkflowConfigSchema`.
  - **Note**: The client might provide an ID in the config, or we generate one. For consistency, the API should probably ignore the ID in the body and generate a new UUID, then inject it into the config.

### 4. Update Workflow
- **Method**: `PUT /api/workflows/:id`
- **Body**: Partial or full update
- **Response**: Updated workflow

### 5. Delete Workflow
- **Method**: `DELETE /api/workflows/:id`
- **Response**: Success status

## Data Access Layer

扩展 `src/db/workflows.ts` 以支持完整的 CRUD 操作：
- `findAll(limit, offset)`
- `findById(id)`
- `update(id, data)`
- `delete(id)`

## Module Structure

```
src/
  routes/
    workflow.ts      # Hono route definitions
  index.ts           # Mount /api/workflows
```
