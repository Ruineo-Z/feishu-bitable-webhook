# Workflow-only 预发布联调清单

> 目标：在预发布环境验证 workflow-only 主链路、字段映射 registry 与回滚开关行为，完成 OpenSpec `5.2/5.4` 的前置证据。

## 0. 测试范围与通过标准

- 范围：
  - 事件路由（scope 命中）
  - 字段映射（`field_id -> field_name`）
  - workflow 动作插件（create/update/delete/query）
  - 执行日志可观测性
  - 回滚开关有效性
- 通过标准：
  - 所有阻断项（标记为 **P0**）必须通过
  - 失败项需有明确原因和补救记录

---

## 1. 联调前准备（P0）

- [ ] 1.1 环境变量确认
  - [ ] `SUPABASE_URL`、`SUPABASE_KEY` 正确
  - [ ] `FEISHU_APP_ID`、`FEISHU_APP_SECRET` 正确
  - [ ] `LEGACY_RULES_REALTIME_ENABLED=false`（workflow-only）
- [ ] 1.2 数据库迁移执行
  - [ ] 执行 `supabase/migrations/workflow_field_mapping_registry.sql`
  - [ ] 确认存在表 `public.bitable_field_mappings`
- [ ] 1.3 服务启动确认
  - [ ] `bun run dev` 启动成功
  - [ ] 控制台出现 `workflow-only 模式已启用`、`长连接事件监听已启动`

---

## 2. 字段映射 API 验证（P0）

- [ ] 2.1 刷新映射
  - [ ] 调用 `POST /api/mappings/refresh`
  - [ ] body 示例：
    ```json
    {
      "appToken": "你的_app_token",
      "tableId": "你的_table_id"
    }
    ```
  - [ ] 返回 `code=OK`，且 `fieldsCount > 0`
- [ ] 2.2 查询映射
  - [ ] 调用 `GET /api/mappings?appToken=...&tableId=...`
  - [ ] 返回包含 `mappings`，字段 ID 与字段名对应正确
- [ ] 2.3 旧接口兼容
  - [ ] 调用 `POST /api/bitables/{id}/refresh-fields`
  - [ ] 返回成功，且 Swagger 中显示 deprecated

---

## 3. Workflow 路由与动作验证（P0）

- [ ] 3.1 table scope 命中验证
  - [ ] 创建一个 `scope=table` workflow（绑定目标 `app_token/table_id`）
  - [ ] 在该表新增/编辑记录，确认 workflow 被命中执行
- [ ] 3.2 global scope 命中验证
  - [ ] 创建一个 `scope=global` workflow
  - [ ] 在任意受测表触发事件，确认 global workflow 被命中
- [ ] 3.3 create 动作验证
  - [ ] workflow step 使用 `action.bitable.create`
  - [ ] 确认目标表新增记录成功
- [ ] 3.4 update 动作验证
  - [ ] workflow step 使用 `action.bitable.update`
  - [ ] 确认目标记录字段更新成功
- [ ] 3.5 delete 动作验证
  - [ ] workflow step 使用 `action.bitable.delete`
  - [ ] 通过 `record_id` 或 `filter` 删除成功
- [ ] 3.6 query 动作验证
  - [ ] workflow step 使用 `action.bitable.query`
  - [ ] 返回 records/total/hasMore 结构正确

---

## 4. 字段映射异常场景（P0）

- [ ] 4.1 构造映射缺失
  - [ ] 使用未映射的 `field_id` 作为动作输入
  - [ ] 确认返回 `FIELD_MAPPING_MISSING`
- [ ] 4.2 字段变更事件增量更新
  - [ ] 在飞书侧改字段名（或新增字段）
  - [ ] 触发 `drive.file.bitable_field_changed_v1`
  - [ ] 确认 `bitable_field_mappings` 记录被更新

---

## 5. 日志与可观测性验证（P1）

- [ ] 5.1 执行日志入库
  - [ ] 查询 `GET /api/logs` 有新记录
  - [ ] 记录中包含 workflow 相关 `rule_name` 与 `response.steps`
- [ ] 5.2 错误可见性
  - [ ] 故意制造一个失败 step
  - [ ] 日志中可见失败原因，不出现静默失败
- [ ] 5.3 路由日志检查
  - [ ] 控制台出现候选命中统计（table/global/legacy-fallback）

---

## 6. 回滚演练（P0）

- [ ] 6.1 打开回滚开关
  - [ ] 设置 `LEGACY_RULES_REALTIME_ENABLED=true`
  - [ ] 重启服务
- [ ] 6.2 验证回滚行为
  - [ ] 控制台出现 `旧 rules 链路将参与 realtime 处理`
  - [ ] 触发事件后，legacy rules 可执行
- [ ] 6.3 恢复 workflow-only
  - [ ] 设置 `LEGACY_RULES_REALTIME_ENABLED=false`
  - [ ] 重启服务并确认恢复

---

## 7. 验收结论记录（用于 OpenSpec 5.4）

- [ ] 7.1 记录测试版本信息
  - [ ] 分支 / commit / 环境 / 测试时间
- [ ] 7.2 汇总结果
  - [ ] P0 全通过
  - [ ] P1 若未通过需附风险说明
- [ ] 7.3 更新文档
  - [ ] 更新 `docs/workflow-acceptance.md`
  - [ ] 更新 `openspec/changes/migrate-to-workflow-only-with-field-mapping/tasks.md`

---

## 附：建议执行顺序（最短路径）

1. 第 1 节（准备）
2. 第 2 节（映射 API）
3. 第 3 节（核心动作）
4. 第 4 节（异常场景）
5. 第 6 节（回滚）
6. 第 5 节（日志补查）
7. 第 7 节（验收记录）
