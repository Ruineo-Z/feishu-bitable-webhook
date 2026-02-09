# Rules -> Workflow 能力迁移清单

## 目标

将 legacy `rules` 触发与动作能力迁移至 workflow-only 运行时，并确保业务行为一致。

## 能力对照

| Legacy 能力 | Workflow 能力 | 状态 | 备注 |
|---|---|---|---|
| 条件判断（ConditionEvaluator） | `condition` 插件 | ✅ 已支持 | 保留同一条件语义 |
| 创建记录 `create_record` | `action.bitable.create` | ✅ 已支持 | 接入字段映射 registry |
| 更新记录 `update_record` | `action.bitable.update` | ✅ 已支持 | 接入字段映射 registry |
| 删除记录 `delete_record` | `action.bitable.delete` | ✅ 已支持 | 支持 `record_id` 或 filter 查找 |
| 查询记录 `query_records` | `action.bitable.query` | ✅ 已支持 | 支持 filter/sort/page |
| 发送飞书消息 | `action.feishu.message` | ✅ 已支持 | 返回统一 StepResult |
| 执行日志入库 | `execution_logs` | ✅ 已支持 | workflow 执行结果异步写入 |

## 数据与接口迁移

- 映射存储：`bitables.field_mappings` -> `bitable_field_mappings`
- 映射刷新：`/api/bitables/{id}/refresh-fields` -> `/api/mappings/refresh`
- 运行时链路：双链路 -> workflow-only（可通过 `LEGACY_RULES_REALTIME_ENABLED=true` 回滚）

## 切换前检查

- [ ] `bitable_field_mappings` 已建表并可读写
- [ ] 关键业务表已刷新映射
- [ ] 目标 workflows 已覆盖核心业务动作
- [ ] 监控可看到 workflow 执行日志
