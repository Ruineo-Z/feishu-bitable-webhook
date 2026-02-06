# 日志记录完善

## 任务描述

完善执行日志结构，记录完整的执行链路，包括每个动作的独立结果，便于问题排查和审计。

## 输入

- 规则配置（RuleConfig）
- 匹配结果（MatchedRule）
- 动作执行结果（ActionResult）

## 输出

增强版的 `ExecutionLog` 记录

## 实现步骤

### 步骤 1：扩展日志接口

**文件**：`src/db/execution-logs.ts`

```typescript
// 动作执行记录
export interface ActionExecution {
  name: string             // 动作名称
  type: string             // 动作类型
  params: Record<string, unknown>  // 执行参数
  status: 'success' | 'failed'     // 执行状态
  error?: string           // 错误信息
  durationMs: number       // 执行耗时
  response?: Record<string, unknown>  // 响应数据
}

// 增强版执行日志
export interface ExecutionLog {
  // 基础信息
  id?: string
  rule_id: string
  rule_name: string
  rule_version: number      // 新增：规则版本
  trigger_action: string
  record_id: string
  operator_openid?: string
  
  // 完整快照
  fields: Record<string, unknown>
  beforeFields: Record<string, unknown>
  
  // 动作执行详情（新增）
  actions: ActionExecution[]
  
  // 汇总信息
  status: 'success' | 'partial' | 'failed'
  totalDurationMs: number
  
  // 时间
  created_at?: string
}

// 日志筛选条件扩展
export interface LogFilter {
  ruleId?: string
  status?: 'success' | 'failed' | 'partial'
  operatorOpenId?: string
  startDate?: string
  endDate?: string
  limit?: number
  offset?: number
  // 新增
  actionType?: string       // 按动作类型筛选
  minDuration?: number      // 最小执行耗时
  maxDuration?: number      // 最大执行耗时
}
```

### 步骤 2：更新日志创建逻辑

**文件**：`src/lark.ts`（修改 `logExecution` 函数）

```typescript
interface LogContext {
  rule: RuleConfig
  recordId: string
  actionData: any
  eventData: EventData
  fields: Record<string, unknown>
  beforeFields: Record<string, unknown>
  actionResults: Array<{
    name: string
    type: string
    params: Record<string, unknown>
    result: ActionResult
  }>
}

async function createEnhancedLog(context: LogContext): Promise<void> {
  const {
    rule,
    recordId,
    eventData,
    fields,
    beforeFields,
    actionResults
  } = context
  
  // 计算汇总状态
  const failedCount = actionResults.filter(r => !r.result.success).length
  const status: 'success' | 'partial' | 'failed' = 
    failedCount === 0 ? 'success' :
    failedCount === actionResults.length ? 'failed' : 'partial'
  
  // 构建动作执行详情
  const actions: ActionExecution[] = actionResults.map(action => ({
    name: action.name,
    type: action.type,
    params: action.params,
    status: action.result.success ? 'success' : 'failed',
    error: action.result.error,
    durationMs: action.result.durationMs,
    response: action.result.response
  }))
  
  // 计算总耗时
  const totalDurationMs = actions.reduce((sum, a) => sum + a.durationMs, 0)
  
  const log: Omit<ExecutionLog, 'id' | 'created_at'> = {
    rule_id: rule.id!,
    rule_name: rule.name,
    rule_version: rule.version || 1,  // 规则版本号
    trigger_action: eventData.action_list?.[0]?.action || 'unknown',
    record_id: recordId,
    operator_openid: eventData.operator_id?.open_id,
    fields,
    beforeFields,
    actions,
    status,
    totalDurationMs
  }
  
  await executionLogsDb.create(log)
}
```

### 步骤 3：修改事件处理逻辑

**文件**：`src/lark.ts`（修改 `processEvent` 函数）

```typescript
// 在匹配规则后，收集所有动作结果
const allActionResults: Array<{
  name: string
  type: string
  params: Record<string, unknown>
  result: ActionResult
}> = []

for (const { rule, recordId, matchedActions } of matchedRules) {
  for (const ruleAction of matchedActions) {
    try {
      const actionResult = await executeAction(ruleAction.action, context)
      
      // 收集动作结果
      allActionResults.push({
        name: ruleAction.name,
        type: ruleAction.action.type,
        params: ruleAction.action.params,
        result: actionResult
      })
      
      // 记录单条动作日志（原逻辑）
      await logExecution({
        rule_id: rule.id!,
        rule_name: `${rule.name} - ${ruleAction.name}`,
        trigger_action: actionData?.action || 'unknown',
        record_id: recordId,
        operator_openid: eventData.operator_id?.open_id,
        record_snapshot: { fields },
        status: actionResult.success ? 'success' : 'failed',
        error_message: actionResult.error,
        duration_ms: actionResult.durationMs,
        response: actionResult.response,
      })
      
      if (!actionResult.success && rule.on_failure === 'stop') {
        break
      }
    } catch (error) {
      // 错误处理
      logger.error(`[飞书] 执行动作 ${ruleAction.name} 失败:`, error)
    }
  }
}

// 创建增强版日志（新逻辑）
await createEnhancedLog({
  rule,
  recordId,
  actionData,
  eventData,
  fields,
  beforeFields,
  actionResults: allActionResults
})
```

### 步骤 4：添加日志查询增强

**文件**：`src/db/execution-logs.ts`（追加查询方法）

```typescript
// 按动作类型查询
async function findByActionType(
  actionType: string,
  options: { limit?: number; offset?: number } = {}
): Promise<ExecutionLog[]> {
  let query = getSupabase()
    .from('execution_logs')
    .select('*')
    .contains('actions', [{ type: actionType }])
    .order('created_at', { ascending: false })
  
  if (options.limit) {
    query = query.limit(options.limit)
  }
  if (options.offset) {
    query = query.range(options.offset, options.offset + (options.limit || 50) - 1)
  }
  
  const { data, error } = await query
  if (error) throw error
  return data || []
}

// 按耗时范围查询
async function findByDurationRange(
  minMs: number,
  maxMs: number,
  options: { limit?: number; offset?: number } = {}
): Promise<ExecutionLog[]> {
  let query = getSupabase()
    .from('execution_logs')
    .select('*')
    .gte('totalDurationMs', minMs)
    .lte('totalDurationMs', maxMs)
    .order('totalDurationMs', { ascending: false })
  
  if (options.limit) {
    query = query.limit(options.limit)
  }
  if (options.offset) {
    query = query.range(options.offset, options.offset + (options.limit || 50) - 1)
  }
  
  const { data, error } = await query
  if (error) throw error
  return data || []
}

// 获取执行统计
async function getStatistics(filter: LogFilter = {}): Promise<{
  total: number
  success: number
  failed: number
  partial: number
  avgDuration: number
}> {
  const logs = await find(filter)
  
  const stats = {
    total: logs.length,
    success: logs.filter(l => l.status === 'success').length,
    failed: logs.filter(l => l.status === 'failed').length,
    partial: logs.filter(l => l.status === 'partial').length,
    avgDuration: 0
  }
  
  if (logs.length > 0) {
    const totalDuration = logs.reduce((sum, l) => sum + (l.totalDurationMs || 0), 0)
    stats.avgDuration = Math.round(totalDuration / logs.length)
  }
  
  return stats
}
```

### 步骤 5：数据库迁移

如果需要修改表结构：

```sql
-- 添加 rule_version 字段
ALTER TABLE execution_logs ADD COLUMN rule_version INTEGER DEFAULT 1;

-- 添加 actions 字段（JSONB）
ALTER TABLE execution_logs ADD COLUMN actions JSONB DEFAULT '[]'::jsonb;

-- 添加 total_duration_ms 字段
ALTER TABLE execution_logs ADD COLUMN total_duration_ms INTEGER DEFAULT 0;
```

## 验收标准

- [ ] 日志记录包含完整的动作执行详情
- [ ] 支持按动作类型、耗时范围等维度查询
- [ ] 提供执行统计功能
- [ ] 向后兼容（已有日志可正常读取）
- [ ] 数据库迁移脚本可用

## 测试用例

```typescript
describe('Enhanced Logging', () => {
  it('should create log with action executions', async () => {
    const log = await createEnhancedLog({
      rule: { id: '1', name: 'Test Rule', version: 1 },
      recordId: 'record-1',
      actionData: { action: 'update' },
      eventData: mockEventData,
      fields: { name: 'Test' },
      beforeFields: { name: 'Old' },
      actionResults: [
        {
          name: 'Send Message',
          type: 'send-message',
          params: { receive_id: 'user-1' },
          result: { success: true, durationMs: 100 }
        },
        {
          name: 'Update Record',
          type: 'update-record',
          params: { fields: { status: 'done' } },
          result: { success: true, durationMs: 50 }
        }
      ]
    })
    
    expect(log.actions).toHaveLength(2)
    expect(log.status).toBe('success')
    expect(log.totalDurationMs).toBe(150)
  })
  
  it('should calculate partial status', async () => {
    const log = await createEnhancedLog({
      // ... 一个成功一个失败
      actionResults: [
        { result: { success: true, durationMs: 100 } },
        { result: { success: false, error: 'Failed', durationMs: 50 } }
      ]
    })
    
    expect(log.status).toBe('partial')
  })
})
```

## 相关文件

- 输入：`src/lark.ts`（事件处理）
- 输出：`src/index.ts`（API 查询）
