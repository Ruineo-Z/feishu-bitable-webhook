# 条件评估器增强

## 任务描述

增强条件评估器，支持飞书多维表格的所有字段类型，实现更灵活的条件判断。

## 输入

- 条件配置（Condition）
- 评估上下文（EvaluationContext）
- 字段类型映射

## 输出

布尔值（条件是否满足）

## 实现步骤

### 步骤 1：扩展字段类型处理器接口

**文件**：`src/engine/condition-evaluator.ts`（修改）

```typescript
// 新增：字段类型处理器接口
interface FieldTypeHandler {
  readonly fieldType: string
  readonly operators: string[]
  
  evaluate(
    fieldValue: unknown,
    conditionValue: unknown,
    context: EvaluationContext
  ): boolean
}

// 新增：评估上下文扩展
interface EnhancedEvaluationContext extends EvaluationContext {
  fieldTypes?: Record<string, string>  // 字段 ID → 字段类型
}
```

### 步骤 2：实现各字段类型处理器

**文件**：`src/engine/condition-evaluator.ts`（追加）

```typescript
// 文本类型处理器
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

// 数字类型处理器
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

// 单选类型处理器
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

// 多选类型处理器
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

// 人员类型处理器
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

// 日期类型处理器
const dateHandler: FieldTypeHandler = {
  fieldType: 'date',
  operators: ['equals', 'not_equals', '>', '<', '>=', '<=', 'exists', 'not_exists', 'between'],
  
  evaluate(fieldValue, conditionValue) {
    const dateValue = new Date(String(fieldValue || '')).getTime()
    const dateCondition = new Date(String(conditionValue || '')).getTime()
    
    // 处理 between 运算符
    if (Array.isArray(conditionValue) && conditionValue.length === 2) {
      const start = new Date(conditionValue[0]).getTime()
      const end = new Date(conditionValue[1]).getTime()
      return {
        between: dateValue >= start && dateValue <= end,
      }
    }
    
    return {
      equals: dateValue === dateCondition,
      not_equals: dateValue !== dateCondition,
      '>': dateValue > dateCondition,
      '<': dateValue < dateCondition,
      '>=': dateValue >= dateCondition,
      '<=': dateValue <= dateCondition,
      exists: !isNaN(dateValue),
      not_exists: isNaN(dateValue),
    }
  }
}

// 复选框类型处理器
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

// 关联表类型处理器
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

// 注册所有处理器
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
```

### 步骤 3：更新条件评估逻辑

**文件**：`src/engine/condition-evaluator.ts`（修改 evaluateExpression 方法）

```typescript
// 新增：获取字段类型的辅助函数
function getFieldType(fieldId: string, context: EvaluationContext): string {
  return (context as EnhancedEvaluationContext).fieldTypes?.[fieldId] || 'text'
}

// 修改 evaluateExpression 方法
private static evaluateExpression(
  expr: ConditionExpression,
  context: EvaluationContext
): boolean {
  const fieldType = getFieldType(expr.field, context)
  const handler = FIELD_TYPE_HANDLERS[fieldType] || FIELD_TYPE_HANDLERS.text
  
  if (!handler.operators.includes(expr.operator)) {
    // 如果操作符不支持，回退到文本比较
    const fallbackHandler = FIELD_TYPE_HANDLERS.text
    return fallbackHandler.evaluate(
      this.getNestedValue(context.fields, expr.field),
      expr.value,
      context
    )
  }
  
  const fieldValue = this.getNestedValue(context.fields, expr.field)
  return handler.evaluate(fieldValue, expr.value, context)
}
```

### 步骤 4：更新 EvaluationContext

**文件**：`src/engine/condition-evaluator.ts`（修改 EvaluationContext）

```typescript
export interface EvaluationContext {
  fields: Record<string, unknown>
  recordId: string
  action: string
  operatorOpenId?: string
  beforeFields?: Record<string, unknown>
  // 新增
  fieldTypes?: Record<string, string>  // 字段 ID → 字段类型
  crossTableResults?: Record<string, unknown>  // 跨表格查询结果
}
```

## 验收标准

- [ ] 支持所有飞书字段类型（文本、数字、单选、多选、人员、日期、复选框、关联表）
- [ ] 每个类型支持对应的运算符
- [ ] 不支持的运算符有回退机制
- [ ] 有单元测试覆盖所有场景
- [ ] 性能无明显下降

## 测试用例

```typescript
describe('ConditionEvaluator - Field Type Handlers', () => {
  describe('Text Handler', () => {
    it('should handle equals', () => {
      expect(textHandler.evaluate('hello', 'hello')).toEqual({ equals: true })
    })
    
    it('should handle contains', () => {
      expect(textHandler.evaluate('hello world', 'world')).toEqual({ contains: true })
    })
  })
  
  describe('Number Handler', () => {
    it('should handle greater than', () => {
      expect(numberHandler.evaluate(10, 5)).toEqual({ '>': true })
    })
    
    it('should handle less than or equal', () => {
      expect(numberHandler.evaluate(5, 10)).toEqual({ '<=': true })
    })
  })
  
  describe('MultiSelect Handler', () => {
    it('should handle contains', () => {
      expect(multiSelectHandler.evaluate(['A', 'B', 'C'], 'B')).toEqual({ contains: true })
    })
  })
  
  describe('User Handler', () => {
    it('should handle user array', () => {
      const users = [{ id: 'user1' }, { id: 'user2' }]
      expect(userHandler.evaluate(users, { id: 'user1' })).toEqual({ contains: true })
    })
  })
  
  describe('Date Handler', () => {
    it('should handle between', () => {
      const date = '2024-06-15'
      const range = ['2024-01-01', '2024-12-31']
      expect(dateHandler.evaluate(date, range)).toEqual({ between: true })
    })
  })
})
```

## 相关文件

- 输入：`src/db/rules.ts`（条件配置）
- 输出：`src/engine/event-router.ts`（匹配结果）
