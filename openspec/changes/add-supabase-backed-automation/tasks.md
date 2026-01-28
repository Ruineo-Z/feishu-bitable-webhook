## 1. 数据库层

- [x] 1.1 安装 Supabase 依赖 `@supabase/supabase-js`
- [x] 1.2 创建 `src/db/` 目录结构
- [x] 1.3 实现 Supabase 客户端初始化
- [x] 1.4 实现 bitables 表的 CRUD 操作
- [x] 1.5 实现 rules 表的 CRUD 操作
- [x] 1.6 实现 execution_logs 表的写入和查询操作

## 2. 规则引擎

- [x] 2.1 创建 `src/engine/` 目录结构
- [x] 2.2 实现条件表达式解析器
- [x] 2.3 实现 AND 逻辑求值
- [x] 2.4 实现 OR 逻辑求值
- [x] 2.5 实现各操作符（equals, contains, >, < 等）
- [x] 2.6 实现事件路由器（根据 app_token + table_id 路由）
- [x] 2.7 实现规则匹配器

## 3. 动作执行器

- [x] 3.1 创建 `src/actions/` 目录结构
- [x] 3.2 实现动作注册表
- [x] 3.3 实现 `send_feishu_message` 动作
- [x] 3.4 实现 `call_api` 动作
- [x] 3.5 实现 `create_record` 动作
- [x] 3.6 实现 `update_record` 动作
- [x] 3.7 实现 `delete_record` 动作
- [x] 3.8 实现失败处理策略

## 4. 事件处理器重构

- [x] 4.1 重构 `src/lark.ts` 为事件路由器
- [x] 4.2 集成规则引擎到事件处理流程
- [x] 4.3 实现从 Supabase 加载规则配置
- [x] 4.4 添加 WebSocket 断线重连逻辑
- [x] 4.5 完善错误处理

## 5. 日志系统

- [x] 5.1 实现执行日志写入
- [x] 5.2 实现触发信息捕获
- [x] 5.3 实现性能指标记录
- [ ] 5.4 添加日志查询接口（可选）

## 6. 配置和测试

- [x] 6.1 添加 Supabase 环境变量到 `.env.example`
- [x] 6.2 编写数据库迁移 SQL 脚本
- [ ] 6.3 编写单元测试（条件匹配、动作执行）
- [ ] 6.4 编写集成测试（完整流程）
- [ ] 6.5 更新 README 文档
