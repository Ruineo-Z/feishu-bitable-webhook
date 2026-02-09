# Workflow-only 切换与回滚 Runbook

## 切换步骤

1. 数据准备
   - 执行 `supabase/migrations/workflow_field_mapping_registry.sql`
   - 对关键 `app_token + table_id` 调用 `/api/mappings/refresh`
2. 灰度验证
   - 在预发布环境保持 `LEGACY_RULES_REALTIME_ENABLED=true`
   - 对比 workflow 与 legacy rules 结果
3. 正式切换
   - 生产环境设置 `LEGACY_RULES_REALTIME_ENABLED=false`
   - 重启服务并观察 15~30 分钟关键日志
4. 稳定观察
   - 关注失败率、字段映射缺失告警、执行日志数量变化

## 回滚策略

### 快速回滚（推荐）

- 将 `LEGACY_RULES_REALTIME_ENABLED=true`
- 重启服务
- 验证 legacy rules 恢复执行

### 数据回滚

- `bitable_field_mappings` 为增量表，不影响旧表结构
- 如需回滚映射读取逻辑，可暂时恢复旧 `bitables.field_mappings` 写入链路

## 关键观测点

- `workflow-only 模式已启用` 启动日志
- `命中 N 个工作流候选` 路由日志
- `FIELD_MAPPING_MISSING` 错误码
- `execution_logs` 中 workflow 执行结果
