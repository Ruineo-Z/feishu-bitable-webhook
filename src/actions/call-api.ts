import { ActionHandler, ActionResult } from './registry'
import { logger, createLoggerWithTrace } from '../logger'

const callApi: ActionHandler = {
  async execute(params, context): Promise<ActionResult> {
    const { url, method = 'GET', headers, body } = params
    const traceId = (context as { traceId?: string }).traceId
    const log = traceId ? createLoggerWithTrace(traceId, 'call-api.ts') : logger

    if (!url) {
      throw new Error('Missing required param: url')
    }

    const startTime = Date.now()

    try {
      const response = await fetch(url, {
        method: method.toUpperCase(),
        headers: headers || {},
        body: body ? JSON.stringify(body) : undefined
      })

      const responseData = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(`API returned ${response.status}: ${JSON.stringify(responseData)}`)
      }

      return {
        success: true,
        response: responseData,
        durationMs: Date.now() - startTime
      }
    } catch (error) {
      log.error('[call-api] 请求失败:', error)
      throw new Error(`API call failed: ${error}`)
    }
  }
}

export default callApi
