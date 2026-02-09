# Design: API Documentation (Swagger UI)

## Architecture

利用 Hono 框架生态中的 `@hono/zod-openapi` 和 `@hono/swagger-ui` 来自动生成和展示 API 文档。

- **OpenAPI Generator**: `OpenAPIHono` 实例会自动收集所有注册路由的 schema 定义。
- **Documentation Endpoint**: 通过 `app.doc()` 方法暴露 JSON 格式的 OpenAPI 规范。
- **UI Middleware**: 使用 `swaggerUI` 中间件渲染交互式网页。

## Configuration

### OpenAPI Specification (`/doc`)
- **Path**: `/doc`
- **Content**:
  - `openapi`: "3.0.0"
  - `info`:
    - `title`: "Feishu Bitable Webhook API"
    - `version`: "1.0.0"
    - `description`: "API documentation for the User-Defined Workflow Engine"

### Swagger UI (`/docs`)
- **Path**: `/docs`
- **Source**: 指向 `/doc` 接口获取数据。

## Code Changes

### `src/index.ts`
- 引入 `swaggerUI`。
- 注册 `/doc` 路由。
- 注册 `/docs` 路由。

```typescript
import { swaggerUI } from '@hono/swagger-ui'

// ...

app.doc('/doc', {
  openapi: '3.0.0',
  info: {
    version: '1.0.0',
    title: 'Feishu Bitable Webhook API',
  },
})

app.get('/docs', swaggerUI({ url: '/doc' }))
```
