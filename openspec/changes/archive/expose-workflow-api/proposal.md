## Why

上一阶段完成了用户自定义工作流引擎（后端核心），支持通过数据库配置驱动工作流运行。为了让用户（或前端应用）能够便捷地管理这些工作流，我们需要暴露一组标准的 RESTful API 接口。这将允许外部系统创建、查询、更新和删除工作流配置，而无需直接访问数据库。

## What Changes

- **新增 API 路由**：基于 Hono 框架新增 `/api/workflows` 相关路由。
- **实现 CRUD 逻辑**：封装对 `workflows` 表的增删改查操作。
- **输入验证**：使用 Zod 验证 API 请求体（复用现有的 DSL Schema）。
- **Swagger 文档**：自动生成 API 文档（利用 `@hono/zod-openapi`）。

## Capabilities

### New Capabilities
- `workflow-api`: 提供工作流管理的 HTTP 接口 (GET/POST/PUT/DELETE)。

### Modified Capabilities
- `workflow-dsl`: (复用) 将现有的 DSL Schema 用于 API 输入验证。

## Impact

- **新增文件**: `src/routes/workflow.ts` (API 实现)。
- **修改文件**: `src/index.ts` (注册新路由)。
- **依赖**: 复用项目现有的 `hono`, `zod` 等依赖。
