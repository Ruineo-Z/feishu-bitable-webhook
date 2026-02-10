## 1. 数据模型与迁移准备

- [ ] 1.1 设计 `workflows` 事件路由结构化字段（如 `trigger_actions`）及索引策略
- [ ] 1.2 新增 Supabase migration：添加事件路由字段、索引与必要约束
- [ ] 1.3 编写回填脚本：从 `trigger.config.action/actions` 归一化回填事件路由字段
- [ ] 1.4 产出迁移审计输出（已回填、保持通配、异常项）

## 2. Scope 模型与 API 契约

- [ ] 2.1 扩展 `workflow/scope` 模型，支持可选 `scope.eventTypes`
- [ ] 2.2 更新 workflow 创建/更新接口 schema，增加 `eventTypes` 校验与枚举限制
- [ ] 2.3 实现 scope 与 trigger 双向规范化逻辑（单侧缺失自动补齐）
- [ ] 2.4 实现冲突校验：`scope.eventTypes` 与 `trigger.config.action/actions` 不一致时返回 400

## 3. 运行时路由增强（table + eventType）

- [ ] 3.1 更新 `workflowsDb` 候选查询，优先按结构化字段过滤事件类型
- [ ] 3.2 保留运行时兜底事件过滤，防止脏数据误执行
- [ ] 3.3 补充路由日志字段（候选数、事件过滤后执行数、跳过数）
- [ ] 3.4 增加路由回归测试（有 eventTypes、无 eventTypes、不匹配场景）

## 4. DSL 分支语义与 DAG 校验

- [ ] 4.1 扩展 DSL schema：支持 `condition.onTrue/onFalse` 与节点 `next`
- [ ] 4.2 实现图结构校验（节点唯一、引用存在、无环）
- [ ] 4.3 重构执行引擎为节点跳转执行，并保持失败边界一致
- [ ] 4.4 保持线性 steps 兼容执行（无跳转字段时沿用顺序语义）
- [ ] 4.5 补充分支执行测试（true/false 分支、混合线性+分支、非法环路）

## 5. Web UI 与文档同步

- [ ] 5.1 更新工作流管理 UI：新增 `eventTypes` 配置与展示
- [ ] 5.2 更新默认 DSL 模板，提供 if/else 分支示例
- [ ] 5.3 在编辑态保留并可回显分支字段与事件过滤字段
- [ ] 5.4 更新 `/doc` 与 `/docs` 的 OpenAPI/Swagger 示例（含 eventTypes 与分支 DSL）
- [ ] 5.5 更新 README 与联调文档，明确“scope 可选事件过滤 + DAG 分支”语义

## 6. 验收与上线准备

- [ ] 6.1 执行端到端联调：A 表事件触发 -> 路由过滤 -> 分支执行 -> 日志验证
- [ ] 6.2 验证迁移后旧 workflow 兼容行为（未配置 eventTypes 与线性 DSL）
- [ ] 6.3 形成回滚方案说明（migration 回滚、代码回退、配置恢复）
- [ ] 6.4 完成验收记录并确认可进入实现阶段
