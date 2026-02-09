## Why

当前事件处理仍然是 `workflow` 与 `rules` 双链路并行，导致行为难以预测、排障成本高，并且 `workflow` 无法独立承载核心业务动作。与此同时，飞书事件字段以 `field_id` 为主，而动作配置与写入通常使用字段名，缺少统一映射模型会直接影响工作流稳定性。

## What Changes

- 将事件执行主链路收敛为 **workflow-only**：事件仅通过 workflow scope 路由与执行引擎处理。
- 新增独立字段映射能力（按 `app_token + table_id + field_id` 管理），用于事件字段与动作参数之间的稳定转换。
- 为 workflow 引擎补齐核心多维表格动作能力（create/update/delete/query），替代旧 rules 动作依赖。
- 下线运行时对 `bitables` 表级白名单/连接配置的强依赖，仅保留与字段映射相关的必要能力。
- **BREAKING**：旧 `rules` 触发链路不再参与实时事件执行；依赖旧链路的行为需迁移到 workflow。
- **BREAKING**：`/api/bitables/{id}/refresh-fields` 将由新的字段映射刷新能力替代（按 `app_token + table_id` 维度）。

## Capabilities

### New Capabilities
- `workflow-runtime`: 定义 workflow-only 的事件路由、执行语义、失败边界与兼容要求。
- `field-mapping-registry`: 定义字段映射的存储、刷新、增量更新与读取契约，保障 `field_id` 与字段名可互转。

### Modified Capabilities
- `api-documentation`: 更新接口文档要求，反映字段映射新接口与旧 bitables 刷新接口替代关系。

## Impact

- Affected code:
  - `src/lark.ts`（事件主流程、旧 rules 链路移除、映射接入）
  - `src/workflow/plugins/*`（新增动作插件）
  - `src/actions/*`（旧动作与映射读取路径调整）
  - `src/index.ts`（映射刷新 API 与文档路由更新）
  - `src/db/*`（映射存储访问层）
- Affected data model:
  - 新增字段映射表（独立于 `bitables`）
  - 旧 `rules` 与 `bitables` 的运行时职责下沉/迁移
- Affected ops:
  - 需提供迁移与回滚策略，确保线上工作流切换期间可观测与可恢复
