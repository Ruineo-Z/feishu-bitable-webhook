# Project Context

## Purpose
A webhook service for Feishu (飞书) Bitable (多维表格) that listens to record change events via WebSocket long-lived connections. The service captures and logs record changes from Feishu Bitable, enabling integration with external systems.

## Tech Stack
- **Runtime**: Bun
- **Language**: TypeScript
- **Web Framework**: Hono (with @hono/zod-openapi for OpenAPI support)
- **API Documentation**: Swagger UI via @hono/swagger-ui
- **Validation**: Zod
- **Feishu SDK**: @larksuiteoapi/node-sdk
- **Configuration**: dotenv

## Project Conventions

### Code Style
- TypeScript with strict mode enabled
- ESNext module system with bundler resolution
- No comments in code unless explaining complex logic
- Environment variables for all secrets (FEISHU_APP_ID, FEISHU_APP_SECRET)

### Architecture Patterns
- WebSocket long-lived connection for event listening
- Event dispatcher pattern for handling Feishu events
- Simple HTTP server for health checks and API docs
- Separation of concerns: lark.ts handles Feishu SDK, index.ts handles server setup

### Testing Strategy
No explicit testing setup defined.

### Git Workflow
- Main branch: main
- Conventional Commits for commit messages

## Domain Context
- **Feishu/Lark**: Enterprise collaboration platform by ByteDance
- **Bitable**: Multi-dimensional table feature in Feishu (like Airtable)
- **WebSocket Events**: `drive.file.bitable_record_changed_v1` and `drive.file.bitable_record_changed_v2` for record change events
- Event payload includes: action_type, record_id, table_id, file_token, operator_id

## Important Constraints
- Requires valid Feishu App credentials (app_id, app_secret)
- WebSocket connection requires persistent network access
- Environment variables must be configured before running

## External Dependencies
- **Feishu API**: https://open.feishu.cn (Lark suite API)
- **Feishu SDK**: @larksuiteoapi/node-sdk for Node.js/Bun
