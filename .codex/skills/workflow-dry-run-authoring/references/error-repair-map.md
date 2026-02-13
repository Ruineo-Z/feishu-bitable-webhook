# Dry-run 错误修复映射

按 `errors[].code` 修复，优先使用 `errors[].path` 精确定位。

## 结构类

- `WORKFLOW_ID_REQUIRED`
  - 含义：`operation=update` 但未提供 `workflowId`
  - 修复：补充 `workflowId`

- `WORKFLOW_NOT_FOUND`
  - 含义：更新目标不存在
  - 修复：确认 workflowId 是否正确

- `WORKFLOW_SCOPE_TABLE_REQUIRED`
  - 含义：scope 不是 table 或缺少 app/table 绑定
  - 修复：设置 `scope.type=table` 并补齐 `scope.appToken/tableId`

- `WORKFLOW_EVENT_TYPES_INVALID`
  - 含义：`scope.eventTypes` 含非法值
  - 修复：只保留 `record_created|record_updated|record_deleted`

- `WORKFLOW_EVENT_TYPES_CONFLICT`
  - 含义：`scope.eventTypes` 与 trigger 事件过滤冲突
  - 修复：以 `scope.eventTypes` 为准，移除 trigger 里冲突的 `action/actions/eventType/eventTypes`

## 节点类

- `PLUGIN_NOT_REGISTERED`
  - 含义：节点 `type` 未注册
  - 修复：替换为白名单中的已注册类型

- `VALIDATION_ERROR`
  - 含义：节点缺少必填配置
  - 修复：按节点类型补齐必须字段

- `FIELD_MAPPING_MISSING`
  - 含义：字段映射不存在
  - 修复：改用真实字段名/字段 ID，或先刷新字段映射后再试

- `FEISHU_API_ERROR`
  - 含义：参数不符合飞书接口约束
  - 修复：根据 message/details 调整字段值格式、过滤表达式、人员字段结构等

## 执行类

- `WORKFLOW_DRY_RUN_FAILED`
  - 含义：dry-run 执行中断
  - 修复：优先处理触发上下文、模板变量、step 配置问题后重试

- `WORKFLOW_VALIDATION_FAILED`
  - 含义：未知校验失败
  - 修复：按 message 与 path 回退到最小可执行 DSL，逐步加回节点
