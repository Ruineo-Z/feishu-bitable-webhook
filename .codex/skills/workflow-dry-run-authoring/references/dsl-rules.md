# Workflow DSL 规则（本项目版）

## 1) 请求骨架（dry-run）

```json
{
  "operation": "create | update",
  "workflowId": "wf_xxx (update 必填)",
  "name": "工作流名称",
  "isActive": true,
  "dryRun": true,
  "scope": {
    "type": "table",
    "appToken": "app_xxx",
    "tableId": "tbl_xxx",
    "eventTypes": ["record_updated"]
  },
  "config": {
    "id": "wf_xxx",
    "name": "工作流名称",
    "trigger": {
      "type": "lark.bitable.record.changed",
      "config": {
        "app_token": "app_xxx",
        "table_id": "tbl_xxx"
      }
    },
    "steps": []
  }
}
```

## 2) 作用域与事件

- `scope.type` 只支持 `table`
- `scope.eventTypes` 只允许：
  - `record_created`
  - `record_updated`
  - `record_deleted`
- 建议把事件过滤声明在 `scope.eventTypes`，避免与 `trigger.config.action/actions/eventType/eventTypes` 冲突

## 3) 节点类型白名单

- `condition`
- `action.feishu.message`
- `action.feishu.webhook`
- `action.bitable.create`
- `action.bitable.update`
- `action.bitable.delete`
- `action.bitable.query`
- 兼容别名：
  - `action.bitable.create_record`
  - `action.bitable.update_record`
  - `action.bitable.delete_record`
  - `action.bitable.query_records`

## 4) 图结构规则

- `steps[].id` 必须唯一
- `next/onTrue/onFalse` 必须引用存在节点
- 必须是 DAG（不能有环）
- `condition` 节点如果使用分支：`onTrue` 与 `onFalse` 必须同时存在

## 5) 常见节点配置最小集

### condition

```json
{
  "id": "step_condition",
  "type": "condition",
  "config": {
    "logic": "AND",
    "expressions": [
      {
        "field": "状态",
        "operator": "equals",
        "value": "已完成",
        "source": "after"
      }
    ]
  },
  "onTrue": "step_true",
  "onFalse": "step_false"
}
```

### action.feishu.message

```json
{
  "id": "step_message",
  "type": "action.feishu.message",
  "config": {
    "receive_id": "ou_xxx",
    "receive_id_type": "open_id",
    "content": "{\"text\":\"【记录创建通知】\\n<at user_id=\\\"ou_xxx\\\">负责人</at>\\n账号当前昵称: ${trigger.record.fields.账号当前昵称}\\n记录ID: ${trigger.record_id}\"}"
  }
}
```

### action.feishu.webhook

```json
{
  "id": "step_webhook",
  "type": "action.feishu.webhook",
  "config": {
    "webhook_url": "https://open.feishu.cn/open-apis/bot/v2/hook/xxxx",
    "msg_type": "text",
    "content": {
      "text": "【记录创建通知】\n<at user_id=\"ou_xxx\">负责人</at>\n账号当前昵称: ${trigger.record.fields.账号当前昵称}\n记录ID: ${trigger.record_id}"
    },
    "sign_secret": "可选，开启签名校验时填写"
  }
}
```

### action.bitable.create

```json
{
  "id": "step_create",
  "type": "action.bitable.create",
  "config": {
    "app_token": "app_xxx",
    "table_id": "tbl_xxx",
    "fields": {
      "标题": "${trigger.record.fields.标题}"
    }
  }
}
```

### action.bitable.update

```json
{
  "id": "step_update",
  "type": "action.bitable.update",
  "config": {
    "app_token": "app_xxx",
    "table_id": "tbl_xxx",
    "record_id": "${trigger.record_id}",
    "fields": {
      "状态": "已处理"
    }
  }
}
```

### action.bitable.delete

```json
{
  "id": "step_delete",
  "type": "action.bitable.delete",
  "config": {
    "app_token": "app_xxx",
    "table_id": "tbl_xxx",
    "record_id": "rec_xxx"
  }
}
```

### action.bitable.query

```json
{
  "id": "step_query",
  "type": "action.bitable.query",
  "config": {
    "app_token": "app_xxx",
    "table_id": "tbl_xxx",
    "page_size": 20,
    "field_names": ["标题", "状态"]
  }
}
```

## 6) 文本消息规则（重点）

### 6.1 换行规则

- 目标效果必须是真换行，不得出现字面量 `\\n`。
- `action.feishu.webhook` 的 `content.text` 直接使用 `\n`。
- `action.feishu.message` 的 `config.content` 是 JSON 字符串，内部换行需要写成 `\\n`（因为要再转义一层）。

### 6.2 @ 用户规则

- @ 单个用户：`<at user_id="ou_xxx">姓名</at>`
- @ 所有人：`<at user_id="all"></at>`
- 需要动态 @ 时，优先使用 open_id 路径变量（示例）：
  - `${trigger.record.fields.第一负责人.0.id}`

### 6.3 推荐文案结构

建议统一输出顺序：
1. 标题行（如：`【记录创建通知】`）
2. @负责人
3. 关键字段行
4. 记录 ID 行
