## 1. 字段映射 Registry 与数据模型

- [x] 1.1 新增字段映射表与索引（`app_token`、`table_id`、`field_id` 唯一约束）
- [x] 1.2 实现字段映射 DAO（按表查询、单条 upsert、批量覆盖、删除）
- [x] 1.3 将字段变更事件处理改为写入新映射 registry
- [x] 1.4 提供按 `app_token + table_id` 的全量刷新能力并返回刷新统计

## 2. Workflow-only 运行时切换

- [x] 2.1 在事件入口移除 realtime rules 执行调用，仅保留 workflow scope 路由与执行
- [x] 2.2 移除“未配置 bitable 即 return”的运行时拦截逻辑
- [x] 2.3 保留并增强 workflow 候选命中日志（候选数量、命中来源、失败原因）
- [x] 2.4 增加可回滚开关或明确切换策略（便于灰度与回退）

## 3. Workflow 动作能力补齐

- [x] 3.1 为 workflow 插件补充 create-record 动作并接入映射解析
- [x] 3.2 为 workflow 插件补充 delete-record 与 query-records 动作
- [x] 3.3 统一动作结果结构（成功输出、错误码/错误信息、耗时）
- [x] 3.4 对关键动作场景补充自动化测试（成功、参数错误、映射缺失）

## 4. API 与文档契约更新

- [x] 4.1 新增字段映射相关 API（刷新/查询）并补充请求与响应 schema
- [x] 4.2 标注或替代旧 `/api/bitables/{id}/refresh-fields` 接口语义
- [x] 4.3 更新 `/doc` 与 `/docs` 中 workflow-only 与映射流程说明
- [x] 4.4 更新 README 的后端流程图与运行时说明（移除双链路描述）

## 5. 迁移验证与上线准备

- [x] 5.1 形成旧 rules 到 workflow 的能力对照与迁移清单
- [ ] 5.2 执行预发布联调（真实多维表格事件 -> workflow 执行 -> 日志验证）
- [x] 5.3 设计并演练回滚流程（切换失败时快速恢复）
- [ ] 5.4 完成验收记录并确认可进入实现阶段

## 实施进度说明（2026-02-09）

- 当前实现进度：18/20
- 已完成：任务组 1、2、3、4 及 5.1、5.3
- 待完成：
  - 5.2 预发布真实联调（需要在预发布环境执行）
  - 5.4 验收确认（依赖 5.2 的联调证据）
- 预发布联调执行清单：`docs/preprod-workflow-validation-checklist.md`
- 验收记录文档：`docs/workflow-acceptance.md`

