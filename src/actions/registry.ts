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
    const response = await handler.execute(action.params, context)
    return response
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startTime
    }
  }
}
