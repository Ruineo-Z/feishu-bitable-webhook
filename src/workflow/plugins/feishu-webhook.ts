import crypto from 'node:crypto'
import { IWorkflowPlugin, WorkflowContext, StepResult } from '../types'
import { okStep, errStep } from './step-result'
import { appendDryRunEffect, isDryRunContext } from './dry-run'

function maskWebhookUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl)
    const segments = url.pathname.split('/')
    if (segments.length >= 2) {
      segments[segments.length - 1] = '***'
      url.pathname = segments.join('/')
    }
    return url.toString()
  } catch {
    return rawUrl
  }
}

function parseWebhookUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null
  }

  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return null
    }
    return url.toString()
  } catch {
    return null
  }
}

function buildSign(secret: string, timestamp: string): string {
  const stringToSign = `${timestamp}\n${secret}`
  return crypto.createHmac('sha256', stringToSign).update('').digest('base64')
}

function normalizeRequestBody(config: Record<string, unknown>):
  | {
      webhookUrl: string
      requestBody: Record<string, unknown>
      maskedWebhookUrl: string
    }
  | {
      error: string
    } {
  const webhookUrl = parseWebhookUrl(config.webhook_url)
  if (!webhookUrl) {
    return {
      error: 'Missing required config: webhook_url',
    }
  }

  const payloadInput = config.payload
  let requestBody: Record<string, unknown>

  if (payloadInput !== undefined) {
    if (!payloadInput || typeof payloadInput !== 'object' || Array.isArray(payloadInput)) {
      return {
        error: 'Invalid config: payload must be an object',
      }
    }
    requestBody = { ...(payloadInput as Record<string, unknown>) }
  } else {
    const msgType = config.msg_type
    if (typeof msgType !== 'string' || msgType.trim().length === 0) {
      return {
        error: 'Missing required config: msg_type',
      }
    }

    requestBody = {
      msg_type: msgType,
    }

    if (config.content !== undefined) {
      requestBody.content = config.content
    }
    if (config.card !== undefined) {
      requestBody.card = config.card
    }
    if (config.title !== undefined) {
      requestBody.title = config.title
    }

    if (!('content' in requestBody) && !('card' in requestBody)) {
      return {
        error: 'Missing required config: content or card',
      }
    }
  }

  const hasTimestamp = config.timestamp !== undefined
  const hasSign = config.sign !== undefined
  const signSecret = typeof config.sign_secret === 'string' ? config.sign_secret : undefined

  if (!signSecret && hasTimestamp !== hasSign) {
    return {
      error: 'Invalid config: timestamp and sign must be provided together',
    }
  }

  if (signSecret && signSecret.length > 0) {
    const timestamp = hasTimestamp
      ? String(config.timestamp)
      : String(Math.floor(Date.now() / 1000))

    requestBody.timestamp = timestamp
    requestBody.sign = buildSign(signSecret, timestamp)
  } else if (hasTimestamp && hasSign) {
    requestBody.timestamp = String(config.timestamp)
    requestBody.sign = String(config.sign)
  }

  return {
    webhookUrl,
    requestBody,
    maskedWebhookUrl: maskWebhookUrl(webhookUrl),
  }
}

async function parseWebhookResponse(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) {
    return null
  }

  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function resolveWebhookErrorMessage(body: Record<string, unknown>): string {
  if (typeof body.msg === 'string' && body.msg.length > 0) {
    return body.msg
  }

  if (typeof body.StatusMessage === 'string' && body.StatusMessage.length > 0) {
    return body.StatusMessage
  }

  return 'Webhook send failed'
}

function resolveWebhookCode(body: Record<string, unknown>): number | null {
  if (typeof body.code === 'number') {
    return body.code
  }

  if (typeof body.StatusCode === 'number') {
    return body.StatusCode
  }

  return null
}

export class FeishuWebhookPlugin implements IWorkflowPlugin {
  async execute(context: WorkflowContext, config: Record<string, unknown>): Promise<StepResult> {
    const startTime = Date.now()

    try {
      const normalized = normalizeRequestBody(config)
      if ('error' in normalized) {
        return errStep(
          'VALIDATION_ERROR',
          normalized.error,
          Date.now() - startTime,
        )
      }

      const { webhookUrl, requestBody, maskedWebhookUrl } = normalized

      if (isDryRunContext(context)) {
        appendDryRunEffect(context, {
          action: 'feishu.webhook.send',
          target: {
            webhook_url: maskedWebhookUrl,
            msg_type: requestBody.msg_type || 'custom',
          },
          payload: requestBody,
        })

        return okStep(
          {
            dryRun: true,
            preview: {
              webhook_url: maskedWebhookUrl,
              request: requestBody,
            },
          },
          Date.now() - startTime,
        )
      }

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      })

      const responseBody = await parseWebhookResponse(response)

      if (!response.ok) {
        return errStep(
          'FEISHU_API_ERROR',
          `Webhook request failed with status ${response.status}`,
          Date.now() - startTime,
          {
            status: response.status,
            response: responseBody,
          },
        )
      }

      if (responseBody && typeof responseBody === 'object') {
        const body = responseBody as Record<string, unknown>
        const code = resolveWebhookCode(body)
        if (code !== null && code !== 0) {
          return errStep(
            'FEISHU_API_ERROR',
            resolveWebhookErrorMessage(body),
            Date.now() - startTime,
            body,
          )
        }
      }

      return okStep(
        {
          webhook_url: maskedWebhookUrl,
          response: responseBody,
        },
        Date.now() - startTime,
      )
    } catch (error: any) {
      return errStep(
        'PLUGIN_ERROR',
        `Failed to call Feishu webhook: ${error?.message || error}`,
        Date.now() - startTime,
      )
    }
  }
}
