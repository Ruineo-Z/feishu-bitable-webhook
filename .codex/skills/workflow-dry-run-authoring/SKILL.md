---
name: workflow-dry-run-authoring
description: 通过自然语言生成 workflow DSL，并使用 /api/workflows/dry-run 进行循环校验修复，最终调用 /api/workflows 与 /api/workflows/{id} 完成创建或更新；删除走直接确认删除流程。
---

# workflow-dry-run-authoring

将自然语言需求稳定转换为可执行 workflow JSON。先校验，再发布。

## 适用场景

在用户提出以下需求时启用：
- 新建 workflow
- 修改已有 workflow
- 删除 workflow
- 根据报错修复 workflow DSL

## 必须遵守的约束

1. 仅使用以下接口完成闭环：
   - `POST /api/workflows/dry-run`
   - `POST /api/workflows`
   - `PUT /api/workflows/{id}`
   - `DELETE /api/workflows/{id}`
   - 必要时可读：`GET /api/workflows/{id}`
2. 禁止发明未注册节点类型，节点 `type` 仅允许：
   - `condition`
   - `action.feishu.message`
   - `action.feishu.webhook`
   - `action.bitable.create` / `action.bitable.update` / `action.bitable.delete` / `action.bitable.query`
   - 兼容别名：`action.bitable.create_record` / `update_record` / `delete_record` / `query_records`
3. `scope.type` 必须为 `table`，且必须包含 `appToken`、`tableId`。
4. `scope.eventTypes` 仅允许：`record_created`、`record_updated`、`record_deleted`。
5. 使用 `condition` 分支时，`onTrue` 与 `onFalse` 必须同时存在。
6. `config.steps[].id` 必须唯一，且引用的 `next/onTrue/onFalse` 必须指向存在节点。
7. dry-run 修复循环最多执行 3 轮；3 轮后仍失败则停止并输出剩余错误。
8. 删除操作默认不走 dry-run，必须得到用户确认后再执行删除。
9. 发送消息（`action.feishu.message` / `action.feishu.webhook`）必须遵守飞书文本语法：
   - 换行必须写为换行符 `\n`（最终发送文本里要是实际换行，不可出现字面量 `\\n`）。
   - @ 单个用户使用：`<at user_id="ou_xxx">姓名</at>`。
   - @ 所有人使用：`<at user_id="all"></at>`。
   - 动态 @ 时优先从上下文取 open_id，例如：`${trigger.record.fields.第一负责人.0.id}`。

## 执行流程

### 第 1 步：识别操作并补齐输入

先判断操作类型：`create` / `update` / `delete`。

- `create` 最少需要：`name`、业务目标、`scope(appToken/tableId)`。
- `update` 最少需要：`workflowId` + 变更目标；如果用户没有给全量 DSL，先读取 `GET /api/workflows/{id}` 再增量改写。
- `delete` 最少需要：`workflowId`。

缺少关键参数时先问清楚，不要猜。

### 第 2 步：构造候选 dry-run 请求

按模板生成 JSON（见 `templates/`）。

- 创建：`templates/dry-run-body.create.json`
- 更新：`templates/dry-run-body.update.json`

构造规则：
- `operation=update` 时必须带 `workflowId`
- `dryRun` 默认 `true`
- `config.name` 与顶层 `name` 保持一致
- 优先把事件过滤放在 `scope.eventTypes`，避免与 trigger 内旧字段冲突
- 涉及文本通知时，优先输出“标题 + 换行 + @负责人 + 关键字段”的结构化文案

### 第 3 步：调用 dry-run 并循环修复

调用 `POST /api/workflows/dry-run`。

判断逻辑：
- 若返回 `code !== "OK"`：视为请求失败，输出错误并停止
- 若 `data.valid === true`：进入第 4 步
- 若 `data.valid === false`：读取 `data.errors[]`，按 `references/error-repair-map.md` 修复后再次 dry-run

修复优先级：
1. 结构错误（scope、eventTypes、workflowId）
2. 节点类型错误（PLUGIN_NOT_REGISTERED）
3. 节点配置错误（VALIDATION_ERROR、FIELD_MAPPING_MISSING）
4. 外部约束错误（FEISHU_API_ERROR）

若 `data.normalized` 存在，发布时优先使用其中的 `name/config/scope/isActive`。

### 第 4 步：发布（create/update）

dry-run 通过后再调用发布接口：

- 创建：`POST /api/workflows`，请求体用 `templates/workflow-body.create.json`
- 更新：`PUT /api/workflows/{id}`，请求体用 `templates/workflow-body.update.json`

发布前必须向用户展示：
- 最终将提交的 JSON
- 目标接口与 workflowId（若为更新）

### 第 5 步：删除

删除走独立流程：
1. 向用户确认 `workflowId`
2. 二次确认“是否删除”
3. 调用 `DELETE /api/workflows/{id}`

## 输出约定

执行本 Skill 时，始终按以下结构输出：

1. 操作判断（create/update/delete）
2. 候选 dry-run JSON
3. dry-run 结果与错误列表（若失败）
4. 修复后的 JSON（若有）
5. 最终发布/删除请求（待用户确认）

禁止只给自然语言描述，不给结构化 JSON。

## 参考资料

- DSL 规则：`references/dsl-rules.md`
- 错误修复映射：`references/error-repair-map.md`
- dry-run 模板：`templates/dry-run-body.create.json`、`templates/dry-run-body.update.json`
- 发布模板：`templates/workflow-body.create.json`、`templates/workflow-body.update.json`
