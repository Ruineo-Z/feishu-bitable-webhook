# Workflow 变更验收记录

## 验收对象

- `migrate-to-workflow-only-with-field-mapping`
- `add-event-scoped-branching-workflow`
- `standardize-feishu-bitable-field-codec`

## 本地自动化验证（已完成）

- [x] `npx tsc --noEmit`
- [x] `npx tsx tests/workflow/bitable-plugins.test.ts`
- [x] `npx tsx tests/workflow/field-codec.test.ts`
- [x] `npx tsx tests/workflow/scope-routing.test.ts`
- [x] `npx tsx tests/workflow/scope-migration.test.ts`
- [x] `npx tsx tests/workflow/branching-engine.test.ts`

## 关键结论（可由当前证据支持）

### 1) workflow-only + 字段映射能力

- [x] workflow-only 主链路可编译并通过核心插件测试
- [x] 字段映射相关动作（create/delete/query）已由自动化测试覆盖

### 2) eventTypes 路由与兼容行为

- [x] 配置 `eventTypes` 时仅匹配对应事件
- [x] 未配置 `eventTypes` 时保持 wildcard 语义
- [x] 历史 `trigger.config.action/actions` 在运行时兜底过滤可生效

### 3) DAG 分支与线性兼容

- [x] DSL 校验可拒绝无效目标节点与循环依赖
- [x] `condition.onTrue/onFalse` 分支执行正确
- [x] 分支与线性 `next` 混合执行可用

### 4) 字段 codec 编解码能力（新增）

- [x] 文本字段：富文本数组可自动归一为 Feishu 写入所需字符串
- [x] 人员字段：可归一为 `[{id}]` 结构；非法输入可返回字段级错误诊断
- [x] delete/query 过滤条件接入字段类型感知编码，去除插件内重复临时转换逻辑
- [x] 异常透传：执行结果中可保留 Feishu `code/msg/log_id` 以便排障

## 回滚与恢复说明

- [x] 已补充回滚策略文档：`docs/workflow-cutover-runbook.md`
- [x] 包含快速止血、代码回退、结构回退与回退后核验清单

## 仍需预发布联调（需真实飞书环境）

- [ ] 真实飞书事件触发 workflow 执行（A 表实际业务链路）
- [ ] 真实多维表数据联动验证（创建/删除/查询）
- [ ] codec 变更后链路验证：A->B 场景下不再出现 `TextFieldConvFail` / `InvalidFilter`
- [ ] `/api/mappings` 与 `/api/mappings/refresh` 在线验证
- [ ] 执行日志与候选路由日志（含 skipped）在线核验

## 总结

- 代码实现与本地自动化验证已覆盖三个变更的核心能力（含字段 codec）。
- 剩余工作集中在预发布真实事件联调与最终签收。
