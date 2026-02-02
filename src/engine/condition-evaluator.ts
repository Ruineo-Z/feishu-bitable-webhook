import { Condition, ConditionExpression } from '../db/rules'

/**
 * 字段类型处理器接口
 * 为每种字段类型提供专门的条件评估逻辑
 */
export interface FieldTypeHandler {
  readonly fieldType: string
  readonly operators: string[]

  evaluate(
    fieldValue: unknown,
    conditionValue: unknown,
    context: EvaluationContext
  ): Record<string, boolean>
}

/**
 * 增强的评估上下文
 */
export interface EnhancedEvaluationContext extends EvaluationContext {
  fieldTypes?: Record<string, string>  // 字段 ID → 字段类型
  crossTableResults?: Record<string, unknown>  // 跨表格查询结果
}

/**
 * 文本类型处理器
 */
const textHandler: FieldTypeHandler = {
  fieldType: 'text',
  operators: ['equals', 'not_equals', 'contains', 'not_contains', 'exists', 'not_exists'],

  evaluate(fieldValue, conditionValue) {
    const strValue = String(fieldValue || '')
    const strCondition = String(conditionValue || '')

    return {
      equals: strValue === strCondition,
      not_equals: strValue !== strCondition,
      contains: strValue.toLowerCase().includes(strCondition.toLowerCase()),
      not_contains: !strValue.toLowerCase().includes(strCondition.toLowerCase()),
      exists: strValue !== '',
      not_exists: strValue === '',
    }
  }
}

/**
 * 数字类型处理器
 */
const numberHandler: FieldTypeHandler = {
  fieldType: 'number',
  operators: ['equals', 'not_equals', '>', '<', '>=', '<=', 'exists', 'not_exists'],

  evaluate(fieldValue, conditionValue) {
    const numValue = Number(fieldValue) || 0
    const numCondition = Number(conditionValue) || 0

    return {
      equals: numValue === numCondition,
      not_equals: numValue !== numCondition,
      '>': numValue > numCondition,
      '<': numValue < numCondition,
      '>=': numValue >= numCondition,
      '<=': numValue <= numCondition,
      exists: fieldValue !== null && fieldValue !== undefined,
      not_exists: fieldValue === null || fieldValue === undefined,
    }
  }
}

/**
 * 单选类型处理器
 */
const singleSelectHandler: FieldTypeHandler = {
  fieldType: 'singleSelect',
  operators: ['equals', 'not_equals', 'exists', 'not_exists'],

  evaluate(fieldValue, conditionValue) {
    const strValue = String(fieldValue || '')
    const strCondition = String(conditionValue || '')

    return {
      equals: strValue === strCondition,
      not_equals: strValue !== strCondition,
      exists: strValue !== '',
      not_exists: strValue === '',
    }
  }
}

/**
 * 多选类型处理器
 */
const multiSelectHandler: FieldTypeHandler = {
  fieldType: 'multiSelect',
  operators: ['contains', 'not_contains', 'exists', 'not_exists', 'in'],

  evaluate(fieldValue, conditionValue) {
    const values = Array.isArray(fieldValue) ? fieldValue : [fieldValue]
    const strCondition = String(conditionValue || '')

    // 转换为字符串数组进行比较
    const strValues = values.map(v => String(v))

    const contains = strValues.some(v => v === strCondition)
    const notContains = !contains
    const inCondition = strValues.includes(strCondition)

    return {
      contains,
      not_contains: notContains,
      exists: strValues.length > 0,
      not_exists: strValues.length === 0,
      in: inCondition,
    }
  }
}

/**
 * 人员类型处理器
 */
const userHandler: FieldTypeHandler = {
  fieldType: 'user',
  operators: ['contains', 'not_contains', 'exists', 'not_exists', 'in'],

  evaluate(fieldValue, conditionValue) {
    const users = Array.isArray(fieldValue) ? fieldValue : []
    const userIds = users.map((u: any) => u.id || u.user_id || u)
    const targetId = typeof conditionValue === 'object'
      ? (conditionValue as any).id || (conditionValue as any).user_id
      : conditionValue

    const contains = userIds.includes(targetId)

    return {
      contains,
      not_contains: !contains,
      exists: userIds.length > 0,
      not_exists: userIds.length === 0,
      in: contains,
    }
  }
}

/**
 * 日期类型处理器
 */
const dateHandler: FieldTypeHandler = {
  fieldType: 'date',
  operators: ['equals', 'not_equals', '>', '<', '>=', '<=', 'exists', 'not_exists', 'between'],

  evaluate(fieldValue, conditionValue) {
    const dateValue = new Date(String(fieldValue || '')).getTime()
    const dateCondition = new Date(String(conditionValue || '')).getTime()

    const result: Record<string, boolean> = {
      equals: dateValue === dateCondition,
      not_equals: dateValue !== dateCondition,
      '>': dateValue > dateCondition,
      '<': dateValue < dateCondition,
      '>=': dateValue >= dateCondition,
      '<=': dateValue <= dateCondition,
      exists: !isNaN(dateValue),
      not_exists: isNaN(dateValue),
    }

    // 处理 between 运算符
    if (Array.isArray(conditionValue) && conditionValue.length === 2) {
      const start = new Date(conditionValue[0]).getTime()
      const end = new Date(conditionValue[1]).getTime()
      result.between = dateValue >= start && dateValue <= end
    }

    return result
  }
}

/**
 * 复选框类型处理器
 */
const checkboxHandler: FieldTypeHandler = {
  fieldType: 'checkbox',
  operators: ['equals', 'not_equals'],

  evaluate(fieldValue, conditionValue) {
    const boolValue = Boolean(fieldValue)
    const boolCondition = Boolean(conditionValue)

    return {
      equals: boolValue === boolCondition,
      not_equals: boolValue !== boolCondition,
    }
  }
}

/**
 * 关联表类型处理器
 */
const linkHandler: FieldTypeHandler = {
  fieldType: 'link',
  operators: ['contains', 'not_contains', 'exists', 'not_exists', 'in'],

  evaluate(fieldValue, conditionValue) {
    const links = Array.isArray(fieldValue) ? fieldValue : []
    const linkIds = links.map((l: any) => l.id || l.record_id || l)
    const targetId = typeof conditionValue === 'object'
      ? (conditionValue as any).id || (conditionValue as any).record_id
      : conditionValue

    const contains = linkIds.includes(targetId)

    return {
      contains,
      not_contains: !contains,
      exists: linkIds.length > 0,
      not_exists: linkIds.length === 0,
      in: contains,
    }
  }
}

/**
 * 所有字段类型处理器注册表
 */
export const FIELD_TYPE_HANDLERS: Record<string, FieldTypeHandler> = {
  text: textHandler,
  number: numberHandler,
  singleSelect: singleSelectHandler,
  multiSelect: multiSelectHandler,
  user: userHandler,
  date: dateHandler,
  checkbox: checkboxHandler,
  link: linkHandler,
}

/**
 * 扩展的评估上下文
 */

export interface EvaluationContext {
  fields: Record<string, unknown>
  recordId: string
  action: string
  operatorOpenId?: string
  beforeFields?: Record<string, unknown>
  fieldTypes?: Record<string, string>  // 字段 ID → 字段类型
}

/**
 * 获取字段类型的辅助函数
 */
function getFieldType(fieldId: string, context: EvaluationContext): string {
  return context.fieldTypes?.[fieldId] || 'text'
}

export class ConditionEvaluator {
  private static operators: Record<string, (a: unknown, b?: unknown, c?: unknown) => boolean> = {
    equals: (a, b) => String(a) === String(b),
    not_equals: (a, b) => String(a) !== String(b),
    contains: (a, b) => String(a).toLowerCase().includes(String(b).toLowerCase()),
    not_contains: (a, b) => !String(a).toLowerCase().includes(String(b).toLowerCase()),
    '>': (a, b) => Number(a) > Number(b),
    '<': (a, b) => Number(a) < Number(b),
    '>=': (a, b) => Number(a) >= Number(b),
    '<=': (a, b) => Number(a) <= Number(b),
    exists: (a) => a !== null && a !== undefined && a !== '',
    not_exists: (a) => a === null || a === undefined || a === '',
    changed: (a, b, beforeFields) => {
      if (!beforeFields || typeof beforeFields !== 'object') return true
      const beforeValue = (beforeFields as Record<string, unknown>)[b as string]
      return JSON.stringify(a) !== JSON.stringify(beforeValue)
    },
  }

  static evaluate(condition: Condition | undefined, context: EvaluationContext): boolean {
    if (!condition) {
      return true
    }

    const results = condition.expressions.map(expr => this.evaluateExpression(expr, context))

    if (condition.logic === 'OR') {
      return results.some(r => r)
    }

    return results.every(r => r)
  }

  private static evaluateExpression(expr: ConditionExpression, context: EvaluationContext): boolean {
    const fieldType = getFieldType(expr.field, context)
    const handler = FIELD_TYPE_HANDLERS[fieldType] || FIELD_TYPE_HANDLERS.text

    // 如果操作符是该类型处理器支持的，使用处理器
    if (handler.operators.includes(expr.operator)) {
      const fieldValue = this.getNestedValue(context.fields, expr.field)
      const results = handler.evaluate(fieldValue, expr.value, context)
      return results[expr.operator] ?? false
    }

    // 否则回退到原有的通用运算符
    const operatorFn = this.operators[expr.operator]
    if (!operatorFn) {
      throw new Error(`Unknown operator: ${expr.operator}`)
    }

    const fieldValue = this.getNestedValue(context.fields, expr.field)

    // exists / not_exists 不需要比较值
    if (expr.operator === 'exists' || expr.operator === 'not_exists') {
      return operatorFn(fieldValue)
    }

    // changed 需要 beforeFields
    if (expr.operator === 'changed') {
      return operatorFn(fieldValue, expr.field, context.beforeFields)
    }

    const conditionValue = expr.value
    return operatorFn(fieldValue, conditionValue)
  }

  private static getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.')
    let current: unknown = obj

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined
      }
      if (typeof current === 'object') {
        current = (current as Record<string, unknown>)[part]
      } else {
        return undefined
      }
    }

    return current
  }

  static parse(json: string): Condition | undefined {
    if (!json || json.trim() === '') {
      return undefined
    }
    try {
      return JSON.parse(json) as Condition
    } catch {
      throw new Error('Invalid condition JSON')
    }
  }
}
