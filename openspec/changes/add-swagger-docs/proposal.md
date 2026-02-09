## Why

当前的 API 接口缺乏可视化文档，导致前端开发人员和外部系统集成时需要查阅代码或手动测试接口。为了提升开发体验和接口可维护性，我们需要集成 Swagger UI，提供类似 FastAPI 的 `/docs` 页面，允许用户直接在网页端查看和调试 API。

## What Changes

- **集成 Swagger UI**: 引入 `@hono/swagger-ui` 并挂载到 `/docs` 路径。
- **配置 OpenAPI 规范**: 生成并暴露 OpenAPI JSON 文档（如 `/doc`），作为 Swagger UI 的数据源。
- **完善 API 定义**: 确保现有的 API 路由正确使用了 `OpenAPIHono` 的描述字段（summary, description, tags 等），以便生成高质量文档。

## Capabilities

### New Capabilities
- `api-documentation`: 提供基于 OpenAPI 标准的自动生成的交互式 API 文档服务。

### Modified Capabilities
- (无)

## Impact

- 修改 `src/index.ts` 以挂载文档中间件。
- 对现有的路由文件（如 `src/routes/workflow.ts`）进行微调，补充 API 描述信息。
