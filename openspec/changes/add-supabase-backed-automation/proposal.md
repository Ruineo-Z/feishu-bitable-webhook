## Why

当前的飞书多维表格 webhook 服务仅支持单一连接和硬编码的事件处理逻辑，无法满足"一个应用监听多个多维表格，根据不同条件触发不同自动化动作"的需求。需要构建一个可配置的自动化引擎，使用 Supabase 存储规则和日志。

## What Changes

- **新增 Supabase 数据库集成** - 存储多维表格配置、自动化规则和执行日志
- **新增多连接管理** - 支持一个应用监听多个多维表格（通过 app_token 区分）
- **新增规则引擎** - 支持复合条件（AND/OR）和多种触发条件
- **新增动作执行器** - 支持发送飞书消息、调用 API、更新记录等动作
- **新增执行日志** - 记录每次触发的触发人、执行结果和时间戳
- **重构事件处理器** - 支持根据 table_id 路由到对应规则

## Capabilities

### New Capabilities
- `bitable-connection`: 多维表格连接管理，管理多个多维表格的连接配置
- `rule-engine`: 规则引擎，支持复合条件表达式和触发匹配
- `action-executor`: 动作执行器，执行规则匹配后的动作
- `execution-logging`: 执行日志，记录触发信息和执行结果

### Modified Capabilities
- （无）

## Impact

- **新增依赖**: `@supabase/supabase-js`
- **新增目录**:
  - `src/db/` - 数据库操作层
  - `src/engine/` - 规则引擎
  - `src/actions/` - 动作执行器
  - `src/config/` - 配置文件
- **修改文件**: `src/lark.ts` - 重构为事件路由器
- **新增环境变量**: `SUPABASE_URL`, `SUPABASE_KEY`
