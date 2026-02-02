import client from '../lark'
import { logger } from '../logger'
import { ActionHandler, ActionResult } from './registry'

/**
 * 跨表格操作参数
 */
export interface CrossTableParams {
  // 源表格配置
  sourceAppToken: string
  sourceTableId: string
  sourceRecordId?: string

  // 目标表格配置
  targetAppToken: string
  targetTableId: string

  // 字段映射
  fieldMappings: FieldMapping[]

  // 筛选条件
  filter?: Condition

  // 选项
  options?: {
    createIfNotExists?: boolean
    updateIfExists?: boolean
  }
}

/**
 * 字段映射
 */
export interface FieldMapping {
  sourceField: string
  targetField: string
  transform?: string
  transformParams?: Record<string, unknown>
}

/**
 * 转换函数定义
 */
export interface TransformFunction {
  name: string
  fn: (value: unknown, params?: Record<string, unknown>) => unknown
}

/**
 * 条件定义
 */
interface Condition {
  logic: 'AND' | 'OR'
  expressions: Array<{
    field: string
    operator: string
    value: unknown
  }>
}

/**
 * 跨表格操作结果
 */
export interface CrossTableResult {
  success: boolean
  sourceRecord?: Record<string, unknown>
  targetRecordId?: string
  targetRecord?: Record<string, unknown>
  error?: string
  durationMs: number
}

// 内置转换函数
const TRANSFORM_FUNCTIONS: Record<string, TransformFunction> = {
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
        new RegExp(String(params.search), (params.flags as string) || 'g'),
        String(params.replace || '')
      )
    }
  },
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
  join: {
    name: 'join',
    fn: (value, params) => {
      const arr = Array.isArray(value) ? value : [value]
      return arr.join(String(params?.separator || ','))
    }
  },
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
  map: {
    name: 'map',
    fn: (value, params) => {
      if (!params || !params.mapping) return value
      const mapping = params.mapping as Record<string, unknown>
      return mapping[String(value)] ?? value
    }
  },
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

/**
 * 获取转换函数
 */
export function getTransformFunction(name: string): TransformFunction | null {
  return TRANSFORM_FUNCTIONS[name] || null
}

/**
 * 执行转换
 */
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

/**
 * 跨表格操作处理器
 */
export const crossTableAction: ActionHandler = {
  async execute(params: Record<string, unknown>, context: Record<string, unknown>): Promise<ActionResult> {
    const startTime = Date.now()
    const crossParams = params as unknown as CrossTableParams

    try {
      const sourceRecordId = crossParams.sourceRecordId || (context.recordId as string)
      if (!sourceRecordId) {
        throw new Error('Source record ID is required')
      }

      logger.info('[cross-table] 开始跨表格操作', {
        source: `${crossParams.sourceAppToken}/${crossParams.sourceTableId}/${sourceRecordId}`,
        target: `${crossParams.targetAppToken}/${crossParams.targetTableId}`
      })

      // 读取源记录
      const sourceRecord = await fetchSourceRecord(
        crossParams.sourceAppToken,
        crossParams.sourceTableId,
        sourceRecordId
      )

      if (!sourceRecord) {
        throw new Error(`Source record not found: ${sourceRecordId}`)
      }

      logger.info('[cross-table] 源记录:', JSON.stringify(sourceRecord, null, 2))

      // 字段映射和转换
      const targetFields = applyFieldMappings(
        sourceRecord,
        context,
        crossParams.fieldMappings
      )

      logger.info('[cross-table] 目标字段:', JSON.stringify(targetFields, null, 2))

      // 查询目标记录
      let targetRecordId = crossParams.options?.createIfNotExists
        ? await findTargetRecord(crossParams, targetFields)
        : undefined

      // 创建或更新目标记录
      let targetRecord: Record<string, unknown> | undefined

      if (targetRecordId && crossParams.options?.updateIfExists) {
        await client.bitable.v1.appTableRecord.update({
          path: {
            app_token: crossParams.targetAppToken,
            table_id: crossParams.targetTableId,
            record_id: targetRecordId
          },
          data: { fields: targetFields as any }
        })
        targetRecord = { ...targetFields, record_id: targetRecordId }
        logger.info('[cross-table] 更新目标记录成功:', targetRecordId)
      } else if (!targetRecordId) {
        const createResult = await client.bitable.v1.appTableRecord.create({
          path: {
            app_token: crossParams.targetAppToken,
            table_id: crossParams.targetTableId
          },
          data: { fields: targetFields as any }
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

/**
 * 辅助函数：读取源记录
 */
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

/**
 * 辅助函数：应用字段映射
 */
function applyFieldMappings(
  sourceRecord: Record<string, unknown>,
  context: Record<string, unknown>,
  mappings: FieldMapping[]
): Record<string, unknown> {
  const targetFields: Record<string, unknown> = {}

  for (const mapping of mappings) {
    let sourceValue: unknown

    if (mapping.sourceField.startsWith('before:')) {
      const fieldName = mapping.sourceField.slice(7)
      sourceValue = (context.beforeRecord as Record<string, unknown>)?.[fieldName]
    } else {
      sourceValue = sourceRecord[mapping.sourceField]
    }

    if (mapping.transform) {
      sourceValue = applyTransform(sourceValue, mapping.transform, mapping.transformParams)
    }

    targetFields[mapping.targetField] = sourceValue
  }

  return targetFields
}

/**
 * 辅助函数：查找目标记录
 */
async function findTargetRecord(
  params: CrossTableParams,
  targetFields: Record<string, unknown>
): Promise<string | undefined> {
  return undefined
}
