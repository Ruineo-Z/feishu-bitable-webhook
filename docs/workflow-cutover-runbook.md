# Workflow-only 上线 Runbook

## 切换步骤

1. 数据准备
   - 执行 `supabase/migrations/workflow_field_mapping_registry.sql`
   - 对关键 `app_token + table_id` 调用 `/api/mappings/refresh`
2. 预发布验证
   - 触发真实多维表格事件，验证 workflow 命中与执行
   - 验证 `FIELD_MAPPING_MISSING`、执行日志、候选命中统计
3. 正式切换
   - 部署当前版本（仅 workflow-only 主链路）
   - 重启服务并观察 15~30 分钟关键日志
4. 稳定观察
   - 关注失败率、字段映射缺失告警、执行日志数量变化

## 恢复策略（migrate-to-workflow-only-with-field-mapping）

- 代码恢复：回退到删除 legacy rules 之前的提交
- 数据恢复：使用测试前导出的 `rules` 快照或数据库备份恢复
- 说明：当前版本已移除 legacy rules realtime 执行开关，恢复需通过代码回退实现

## 恢复策略（add-event-scoped-branching-workflow）

### A. 快速止血（推荐）

1. 临时关闭异常 workflow（`is_active=false`）
2. 将受影响 workflow 的 `trigger_actions` 置空，恢复“全事件匹配”语义：

```sql
update public.workflows
set trigger_actions = null
where id in ('<workflow_id_1>', '<workflow_id_2>');
```

3. 若分支流程引发行为异常，临时替换为线性 steps 配置（保留最小业务路径）

### B. 代码回退

1. 回退到不包含 eventTypes + DAG 的稳定提交（例如 `3501fd4`）
2. 重新部署并重启服务
3. 验证 `record_updated` 主业务流程可用

### C. 数据结构回退（可选，确认无依赖后执行）

> 仅在确定不再使用新路由字段时执行。

```sql
drop index if exists idx_workflows_trigger_actions_active;
alter table public.workflows drop constraint if exists workflows_trigger_actions_check;
alter table public.workflows drop column if exists trigger_actions;
```

## 恢复策略（standardize-feishu-bitable-field-codec）

### A. 快速止血（推荐）

1. 将异常 workflow 临时置为 `is_active=false`
2. 对异常字段先改为显式模板（如文本字段使用 `.0.text`）规避 codec 命中风险
3. 使用执行日志中的 `code/msg/log_id` 与 `FIELD_CODEC_ENCODE_FAILED` 诊断信息定位字段

### B. 代码回退

1. 回退到引入 codec 模块前的稳定提交
2. 重新部署并重启服务
3. 核验 create/delete/query 链路恢复至原行为

### C. 风险说明

- 当前 codec 以“未知类型 fallback 透传”为默认降级策略，不涉及数据库结构变更
- 回退为纯代码回退，无需额外 DDL 迁移

## 回退后核验清单

- [ ] `/api/workflows` 可正常查询
- [ ] workflow 事件触发与日志写入恢复
- [ ] 关键业务链路（创建/更新/删除/查询）可用
- [ ] `/doc` 与 `/docs` 展示内容与运行时行为一致

## 关键观测点

- `workflow-only 模式已启用` 启动日志
- `匹配到 N 个工作流候选` 路由日志
- `FIELD_MAPPING_MISSING` 错误码
- `execution_logs` 中 workflow 执行结果
