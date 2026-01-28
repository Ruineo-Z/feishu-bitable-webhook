import { Condition, ConditionExpression } from '../db/rules'

export interface EvaluationContext {
  fields: Record<string, unknown>
  recordId: string
  action: string
  operatorOpenId?: string
}

export class ConditionEvaluator {
  private static operators: Record<string, (a: unknown, b?: unknown) => boolean> = {
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
    const operatorFn = this.operators[expr.operator]
    if (!operatorFn) {
      throw new Error(`Unknown operator: ${expr.operator}`)
    }

    const fieldValue = this.getNestedValue(context.fields, expr.field)

    // exists / not_exists 不需要比较值
    if (expr.operator === 'exists' || expr.operator === 'not_exists') {
      return operatorFn(fieldValue)
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
