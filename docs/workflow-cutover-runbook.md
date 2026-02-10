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

## 恢复策略（开发阶段）

- 代码恢复：回退到删除 legacy rules 之前的提交
- 数据恢复：使用测试前导出的 `rules` 快照或数据库备份恢复
- 说明：当前版本已移除 legacy rules realtime 执行开关，恢复需通过代码回退实现

## 关键观测点

- `workflow-only 模式已启用` 启动日志
- `匹配到 N 个工作流候选` 路由日志
- `FIELD_MAPPING_MISSING` 错误码
- `execution_logs` 中 workflow 执行结果
