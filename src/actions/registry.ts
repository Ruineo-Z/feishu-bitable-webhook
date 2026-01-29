import { ActionConfig, ActionParams } from '../db/rules'

export interface ActionResult {
  success: boolean
  error?: string
  response?: Record<string, unknown>
  durationMs: number
}

export interface ActionHandler {
  execute(params: ActionParams, context: Record<string, unknown>): Promise<ActionResult>
}

export class ActionRegistry {
  private static handlers: Map<string, ActionHandler> = new Map()

  static register(type: string, handler: ActionHandler): void {
    this.handlers.set(type, handler)
  }

  static get(type: string): ActionHandler | undefined {
    return this.handlers.get(type)
  }

  static has(type: string): boolean {
    return this.handlers.has(type)
  }

  static getRegisteredTypes(): string[] {
    return Array.from(this.handlers.keys())
  }
}

function convertFeishuFieldValue(value: unknown): unknown {
  if (Array.isArray(value) && value.length > 0) {
    const firstItem = value[0]
    if (typeof firstItem === 'object' && firstItem !== null) {
      const item = firstItem as Record<string, unknown>
      if (item.type === 'text' && typeof item.text === 'string') {
        return item.text
      }
      if (item.users && Array.isArray(item.users)) {
        return item.users.map((u: Record<string, unknown>) => ({ id: u.userId as string }))
      }
    }
    return value
  }
  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>
    if (obj.users && Array.isArray(obj.users)) {
      return obj.users.map((u: Record<string, unknown>) => ({ id: u.userId as string }))
    }
  }
  return value
}

function resolveFieldValue(value: unknown, context: Record<string, unknown>): unknown {
  if (typeof value === 'object' && value !== null && 'field' in (value as Record<string, unknown>)) {
    const fieldName = (value as { field: string }).field
    const fields = context.record as Record<string, unknown>
    const rawValue = fields?.[fieldName]
    return convertFeishuFieldValue(rawValue)
  }
  return value
}

function resolveFields(params: ActionParams, context: Record<string, unknown>): ActionParams {
  const resolved: ActionParams = {}
  for (const [key, value] of Object.entries(params)) {
    if (key === 'fields' && typeof value === 'object' && value !== null) {
      const fields: Record<string, unknown> = {}
      for (const [fieldKey, fieldValue] of Object.entries(value as Record<string, unknown>)) {
        fields[fieldKey] = resolveFieldValue(fieldValue, context)
      }
      resolved[key] = fields
    } else {
      resolved[key] = value
    }
  }
  return resolved
}

export async function executeAction(
  action: ActionConfig,
  context: Record<string, unknown>
): Promise<ActionResult> {
  const startTime = Date.now()

  const handler = ActionRegistry.get(action.type)
  if (!handler) {
    return {
      success: false,
      error: `Unknown action type: ${action.type}`,
      durationMs: Date.now() - startTime
    }
  }

  try {
    const resolvedParams = resolveFields(action.params, context)
    const response = await handler.execute(resolvedParams, context)
    return response
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startTime
    }
  }
}
