# 跨表格操作实现

## 任务描述

实现跨多维表格的数据联动能力，支持从源表格读取记录、字段映射转换、写入目标表格。

## 输入

- 跨表格操作配置（CrossTableParams）
- 执行上下文（ActionContext）

## 输出

操作结果（CrossTableResult）

## 实现步骤

### 步骤 1：定义跨表格操作接口

**文件**：`src/actions/cross-table.ts`

```typescript
import { ActionHandler, ActionResult } from './registry'

// 跨表格操作参数
export interface CrossTableParams {
  // 源表格配置
  sourceAppToken: string
  sourceTableId: string
  sourceRecordId?: string    // 可选，如果不提供则使用上下文中的 recordId
  
  // 目标表格配置
  targetAppToken: string
  targetTableId: string
  
  // 字段映射
  fieldMappings: FieldMapping[]
  
  // 筛选条件（可选）
  filter?: Condition
  
  // 选项
  options?: {
    createIfNotExists?: boolean  // 目标记录不存在时创建
    updateIfExists?: boolean     // 目标记录存在时更新
  }
}

// 字段映射
export interface FieldMapping {
  sourceField: string      // 源字段（支持 before: 前缀）
  targetField: string      // 目标字段
  transform?: string       // 转换函数名
  transformParams?: Record<string, unknown>  // 转换函数参数
}

// 转换函数定义
export interface TransformFunction {
  name: string
  fn: (value: unknown, params?: Record<string, unknown>) => unknown
}

// 条件定义（复用现有结构）
interface Condition {
  logic: 'AND' | 'OR'
  expressions: Array<{
    field: string
    operator: string
    value: unknown
  }>
}

// 跨表格操作结果
export interface CrossTableResult {
  success: boolean
  sourceRecord?: Record<string, unknown>  // 源记录数据
  targetRecordId?: string                 // 目标记录 ID
  targetRecord?: Record<string, unknown>  // 目标记录数据
  error?: string
  durationMs: number
}
```

### 步骤 2：实现转换函数

**文件**：`src/actions/cross-table.ts`（追加）

```typescript
// 内置转换函数
const TRANSFORM_FUNCTIONS: Record<string, TransformFunction> = {
  // 字符串转换
  uppercase: {
    name: 'uppercase',
    fn: (value) => String(value).toUpperCase()
  },
  lowercase: {
    name: 'lowercase',
    fn: (value) => String(value).toLowerCase()
  },
  trim: {
    name: 'trim',
    fn: (value) => String(value).trim()
  },
  replace: {
    name: 'replace',
    fn: (value, params) => {
      if (!params || !params.search) return String(value)
      return String(value).replace(
        new RegExp(String(params.search), params.flags as string || 'g'),
        String(params.replace || '')
      )
    }
  },
  
  // 数值转换
  round: {
    name: 'round',
    fn: (value) => Math.round(Number(value))
  },
  floor: {
    name: 'floor',
    fn: (value) => Math.floor(Number(value))
  },
  ceil: {
    name: 'ceil',
    fn: (value) => Math.ceil(Number(value))
  },
  
  // 数组转换
  join: {
    name: 'join',
    fn: (value, params) => {
      const arr = Array.isArray(value) ? value : [value]
      return arr.join(String(params?.separator || ','))
    }
  },
  
  // 日期转换
  formatDate: {
    name: 'formatDate',
    fn: (value, params) => {
      const date = new Date(String(value))
      return date.toLocaleDateString(String(params?.locale || 'zh-CN'), {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      })
    }
  },
  
  // 映射转换
  map: {
    name: 'map',
    fn: (value, params) => {
      if (!params || !params.mapping) return value
      const mapping = params.mapping as Record<string, unknown>
      return mapping[String(value)] ?? value
    }
  },
  
  // 条件转换
  if: {
    name: 'if',
    fn: (value, params) => {
      if (!params) return value
      const condition = params.condition as string
      const trueValue = params.true
      const falseValue = params.false
      
      switch (condition) {
        case 'empty':
          return (!value || value === '') ? trueValue : falseValue
        case 'notEmpty':
          return (value && value !== '') ? trueValue : falseValue
        case 'equals':
          return value === params.value ? trueValue : falseValue
        default:
          return value
      }
    }
  }
}

// 获取转换函数
export function getTransformFunction(name: string): TransformFunction | null {
  return TRANSFORM_FUNCTIONS[name] || null
}

// 执行转换
export function applyTransform(
  value: unknown,
  transformName: string,
  params?: Record<string, unknown>
): unknown {
  const transform = getTransformFunction(transformName)
  if (!transform) {
    throw new Error(`Unknown transform function: ${transformName}`)
  }
  return transform.fn(value, params)
}
```

### 步骤 3：实现跨表格操作处理器

**文件**：`src/actions/cross-table.ts`（追加）

```typescript
import client from '../lark'
import { logger } from '../logger'

export const crossTableAction: ActionHandler = {
  async execute(params: CrossTableParams, context: Record<string, unknown>): Promise<ActionResult> {
    const startTime = Date.now()
    
    try {
      // 1. 确定源记录 ID
      const sourceRecordId = params.sourceRecordId || (context.recordId as string)
      if (!sourceRecordId) {
        throw new Error('Source record ID is required')
      }
      
      logger.info('[cross-table] 开始跨表格操作', {
        source: `${params.sourceAppToken}/${params.sourceTableId}/${sourceRecordId}`,
        target: `${params.targetAppToken}/${params.targetTableId}`
      })
      
      // 2. 读取源记录
      const sourceRecord = await fetchSourceRecord(
        params.sourceAppToken,
        params.sourceTableId,
        sourceRecordId
      )
      
      if (!sourceRecord) {
        throw new Error(`Source record not found: ${sourceRecordId}`)
      }
      
      logger.info('[cross-table] 源记录:', JSON.stringify(sourceRecord, null, 2))
      
      // 3. 字段映射和转换
      const targetFields = applyFieldMappings(
        sourceRecord,
        context,
        params.fieldMappings
      )
      
      logger.info('[cross-table] 目标字段:', JSON.stringify(targetFields, null, 2))
      
      // 4. 查询目标记录
      let targetRecordId = params.options?.createIfNotExists 
        ? await findTargetRecord(params, targetFields)
        : undefined
      
      // 5. 创建或更新目标记录
      let targetRecord: Record<string, unknown> | undefined
      
      if (targetRecordId && params.options?.updateIfExists) {
        // 更新
        await client.bitable.v1.appTableRecord.update({
          path: {
            app_token: params.targetAppToken,
            table_id: params.targetTableId,
            record_id: targetRecordId
          },
          body: { fields: targetFields }
        })
        targetRecord = { ...targetFields, record_id: targetRecordId }
        logger.info('[cross-table] 更新目标记录成功:', targetRecordId)
      } else if (!targetRecordId) {
        // 创建
        const createResult = await client.bitable.v1.appTableRecord.create({
          path: {
            app_token: params.targetAppToken,
            table_id: params.targetTableId
          },
          data: { fields: targetFields }
        })
        targetRecordId = createResult.data?.record?.record_id
        targetRecord = { ...targetFields, record_id: targetRecordId }
        logger.info('[cross-table] 创建目标记录成功:', targetRecordId)
      }
      
      return {
        success: true,
        response: {
          sourceRecordId,
          targetRecordId,
          targetRecord
        },
        durationMs: Date.now() - startTime
      }
    } catch (error) {
      logger.error('[cross-table] 操作失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime
      }
    }
  }
}

// 辅助函数：读取源记录
async function fetchSourceRecord(
  appToken: string,
  tableId: string,
  recordId: string
): Promise<Record<string, unknown> | null> {
  try {
    const result = await client.bitable.v1.appTableRecord.get({
      path: { app_token: appToken, table_id: tableId, record_id: recordId }
    })
    return result.data?.record?.fields || null
  } catch (error) {
    logger.error('[cross-table] 读取源记录失败:', error)
    return null
  }
}

// 辅助函数：应用字段映射
function applyFieldMappings(
  sourceRecord: Record<string, unknown>,
  context: Record<string, unknown>,
  mappings: FieldMapping[]
): Record<string, unknown> {
  const targetFields: Record<string, unknown> = {}
  
  for (const mapping of mappings) {
    // 获取源值
    let sourceValue: unknown
    
    // 支持 before: 前缀（使用变更前的值）
    if (mapping.sourceField.startsWith('before:')) {
      const fieldName = mapping.sourceField.slice(7)
      sourceValue = (context.beforeRecord as Record<string, unknown>)?.[fieldName]
    } else {
      sourceValue = sourceRecord[mapping.sourceField]
    }
    
    // 应用转换函数
    if (mapping.transform) {
      sourceValue = applyTransform(sourceValue, mapping.transform, mapping.transformParams)
    }
    
    targetFields[mapping.targetField] = sourceValue
  }
  
  return targetFields
}

// 辅助函数：查找目标记录
async function findTargetRecord(
  params: CrossTableParams,
  targetFields: Record<string, unknown>
): Promise<string | undefined> {
  // TODO: 实现根据唯一标识查找目标记录的逻辑
  // 需要指定唯一标识字段
  return undefined
}
```

### 步骤 4：注册跨表格动作

**文件**：`src/actions/index.ts`

```typescript
import { crossTableAction } from './cross-table'

export function registerActions() {
  // ... 其他动作注册
  
  // 注册跨表格动作
  ActionRegistry.register('cross-table', crossTableAction)
  logger.info('[动作] 跨表格操作已注册')
}
```

### 步骤 5：使用示例

```typescript
// 规则配置示例
{
  "trigger": {
    "table_id": "tbl_source",
    "actions": ["update"]
  },
  "actions": [
    {
      "name": "同步到目标表格",
      "type": "cross-table",
      "params": {
        "sourceAppToken": "app_token_source",
        "sourceTableId": "tbl_source",
        "targetAppToken": "app_token_target",
        "targetTableId": "tbl_target",
        "fieldMappings": [
          {
            "sourceField": "名称",
            "targetField": "名称"
          },
          {
            "sourceField": "状态",
            "targetField": "状态",
            "transform": "map",
            "transformParams": {
              "mapping": {
                "进行中": "active",
                "已完成": "done"
              }
            }
          },
          {
            "sourceField": "金额",
            "targetField": "金额_副本",
            "transform": "round"
          }
        ],
        "options": {
          "createIfNotExists": true,
          "updateIfExists": true
        }
      }
    }
  ]
}
```

## 验收标准

- [ ] 支持从源表格读取记录
- [ ] 支持字段映射和转换
- [ ] 支持创建和更新目标记录
- [ ] 支持 before: 前缀（使用变更前的值）
- [ ] 内置常用转换函数（uppercase, lowercase, round, map, if 等）
- [ ] 有单元测试覆盖核心逻辑
- [ ] 有集成测试验证完整流程

## 测试用例

```typescript
describe('CrossTableAction', () => {
  it('should map fields from source to target', async () => {
    const result = await crossTableAction.execute({
      sourceAppToken: 'src_token',
      sourceTableId: 'src_table',
      sourceRecordId: 'src_record',
      targetAppToken: 'tgt_token',
      targetTableId: 'tgt_table',
      fieldMappings: [
        { sourceField: 'name', targetField: '名称' },
        { sourceField: 'status', targetField: '状态' }
      ]
    }, mockContext)
    
    expect(result.success).toBe(true)
  })
  
  it('should apply transform functions', async () => {
    const result = await crossTableAction.execute({
      // ...
      fieldMappings: [
        {
          sourceField: 'amount',
          targetField: 'rounded_amount',
          transform: 'round'
        }
      ]
    }, mockContext)
    
    expect(result.success).toBe(true)
  })
  
  it('should use before: prefix for old values', async () => {
    const result = await crossTableAction.execute({
      // ...
      fieldMappings: [
        {
          sourceField: 'before:status',
          targetField: '原状态'
        }
      ]
    }, mockContext)
    
    expect(result.success).toBe(true)
  })
})

describe('Transform Functions', () => {
  it('should uppercase text', () => {
    expect(applyTransform('hello', 'uppercase')).toBe('HELLO')
  })
  
  it('should round numbers', () => {
    expect(applyTransform(3.6, 'round')).toBe(4)
  })
  
  it('should map values', () => {
    expect(
      applyTransform('a', 'map', { mapping: { a: 'A', b: 'B' } })
    ).toBe('A')
  })
})
```

## 相关文件

- 输入：`src/actions/registry.ts`（动作注册）
- 输出：`src/db/execution-logs.ts`（日志记录）
