## 1. DSL Schema 与运行时模型扩展

- [x] 1.1 在 `workflow/dsl/schema` 中为 `condition.expressions[]` 增加可选 `source` 字段并补充枚举校验（before/after）。
- [x] 1.2 为 workflow step 增加可选 `when` 与 unresolved-template policy 字段，并保证默认值向后兼容。
- [x] 1.3 更新 workflow 配置归一化与持久化路径，确保新字段在 create/update/list/get 中完整透传。

## 2. 条件评估与执行引擎增强

- [x] 2.1 扩展 condition 插件上下文，支持按表达式 `source` 从 `beforeFields` 或 `fields` 取值。
- [x] 2.2 在执行引擎中实现 step `when` 守卫评估，guard=false 时标记 skipped 并继续流程。
- [x] 2.3 实现 unresolved-template policy（fail/skip）在 action 执行前的统一处理逻辑。
- [x] 2.4 扩展执行日志结构，记录 `skip_reason`、`evaluated_source`、`template_policy`。

## 3. API 与管理 UI 更新

- [x] 3.1 更新 workflow 路由请求校验与 OpenAPI schema，纳入 `source`、`when`、policy 字段定义。
- [x] 3.2 更新 Swagger 示例，请求样例覆盖 before/after 来源与 guard/policy 组合。
- [x] 3.3 更新工作流管理 UI 表单与前端校验，支持配置并编辑 `source`、`when`、policy。
- [x] 3.4 更新 UI 列表/详情展示逻辑，确保回显新字段且不破坏旧 workflow 编辑体验。

## 4. 测试与迁移验证

- [x] 4.1 新增 condition/source 单元测试（before 有值、before 为空、after 默认行为）。
- [x] 4.2 新增引擎 guard 跳过测试（step 跳过但流程继续）。
- [x] 4.3 新增模板策略测试（fail/skip 分支与日志断言）。
- [x] 4.4 使用 A→B 负责人同步 workflow 进行回归联调，验证“旧值为空不报错、旧值有值可删除、after 为空不创建”。
