import { FieldValue } from './index'

/**
 * 字段类型转换器
 * 将飞书格式的字段值转换为内部统一格式
 */
export class FieldTypeConverter {
  /**
   * 转换人员字段
   * 飞书格式: [{ users: [{ user_id: "xxx" }] }]
   * 内部格式: [{ id: "xxx" }]
   */
  static convertUsers(value: any): { id: string }[] {
    if (!value) return []
    if (Array.isArray(value)) {
      return value.map(item => {
        // 处理 { users: [...] } 格式
        if (item.users && Array.isArray(item.users)) {
          return item.users.map((u: any) => ({ 
            id: u.user_id || u.userId || u.id || String(u) 
          }))
        }
        // 处理 { user_id: "xxx" } 格式
        if (item.user_id || item.userId || item.id) {
          return { 
            id: item.user_id || item.userId || item.id 
          }
        }
        // 直接是字符串
        return { id: String(item) }
      }).flat().filter(Boolean)
    }
    return []
  }

  /**
   * 转换富文本/文本字段
   * 飞书格式: [{ type: "text", text: "xxx" }]
   * 内部格式: "xxx"
   */
  static convertRichText(value: any): string {
    if (!value) return ''
    if (Array.isArray(value)) {
      return value
        .map((item: any) => {
          if (item.type === 'text' && item.text) {
            return item.text
          }
          return String(item)
        })
        .join('')
    }
    return String(value || '')
  }

  /**
   * 转换数值字段
   * 飞书格式: 100 或 "100"
   * 内部格式: 100
   */
  static convertNumber(value: any): number {
    if (typeof value === 'number') return value
    if (typeof value === 'string') {
      const parsed = parseFloat(value)
      return isNaN(parsed) ? 0 : parsed
    }
    return 0
  }

  /**
   * 转换布尔值字段
   * 飞书格式: true/false
   * 内部格式: true/false
   */
  static convertBoolean(value: any): boolean {
    return Boolean(value)
  }

  /**
   * 转换关联表字段
   * 飞书格式: [{ record_id: "xxx" }]
   * 内部格式: [{ id: "xxx" }]
   */
  static convertLink(value: any): { id: string }[] {
    if (!value) return []
    if (Array.isArray(value)) {
      return value.map(item => ({
        id: item.record_id || item.id || String(item)
      }))
    }
    return []
  }

  /**
   * 转换复选框字段
   */
  static convertCheckbox(value: any): boolean {
    return Boolean(value)
  }

  /**
   * 转换单选字段
   */
  static convertSingleSelect(value: any): string {
    return String(value || '')
  }

  /**
   * 转换多选字段
   */
  static convertMultiSelect(value: any): string[] {
    if (!value) return []
    if (Array.isArray(value)) {
      return value.map(v => String(v))
    }
    return [String(value)]
  }

  /**
   * 主转换函数
   * 根据字段类型选择对应的转换方法
   */
  static convert(value: any, fieldType: string): FieldValue {
    switch (fieldType) {
      case 'User':
        return this.convertUsers(value)
      case 'RichText':
      case 'Text':
        return this.convertRichText(value)
      case 'Number':
        return this.convertNumber(value)
      case 'Checkbox':
        return this.convertCheckbox(value)
      case 'Link':
        return this.convertLink(value)
      case 'SingleSelect':
        return this.convertSingleSelect(value)
      case 'MultiSelect':
        return this.convertMultiSelect(value)
      default:
        return value
    }
  }

  /**
   * 安全转换（带默认值）
   */
  static convertSafe(value: any, fieldType: string, defaultValue: FieldValue = null): FieldValue {
    try {
      return this.convert(value, fieldType)
    } catch {
      return defaultValue
    }
  }
}
