import crypto from 'node:crypto'
import http from 'node:http'
import { AddressInfo } from 'node:net'
import { FeishuWebhookPlugin } from '../../src/workflow/plugins/feishu-webhook.ts'

function expect(actual: unknown) {
  return {
    toBe(expected: unknown) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`)
      }
    },
    toContain(expected: string) {
      if (!String(actual).includes(expected)) {
        throw new Error(`Expected ${JSON.stringify(actual)} to contain ${expected}`)
      }
    },
    toBeGreaterThan(expected: number) {
      if (typeof actual !== 'number' || actual <= expected) {
        throw new Error(`Expected number > ${expected} but got ${JSON.stringify(actual)}`)
      }
    },
  }
}

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn()
    console.log(`✓ ${name}`)
  } catch (error) {
    console.log(`✗ ${name}`)
    console.error(error)
    process.exit(1)
  }
}

async function createMockWebhookServer() {
  const payloads: any[] = []

  const server = http.createServer((req, res) => {
    let rawBody = ''

    req.on('data', (chunk) => {
      rawBody += chunk.toString()
    })

    req.on('end', () => {
      try {
        payloads.push(rawBody ? JSON.parse(rawBody) : {})
      } catch {
        payloads.push({ _raw: rawBody })
      }

      res.writeHead(200, {
        'Content-Type': 'application/json',
      })
      res.end(JSON.stringify({ code: 0, msg: 'success' }))
    })
  })

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve())
  })

  const address = server.address() as AddressInfo
  const webhookUrl = `http://127.0.0.1:${address.port}/open-apis/bot/v2/hook/mock-token`

  return {
    webhookUrl,
    payloads,
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error)
          else resolve()
        })
      })
    },
  }
}

function buildSign(secret: string, timestamp: string): string {
  return crypto
    .createHmac('sha256', `${timestamp}\n${secret}`)
    .update('')
    .digest('base64')
}

async function run() {
  console.log('Workflow Feishu Webhook Plugin Tests\n')

  await test('dry-run 模式下不发送请求，只记录预览 effect', async () => {
    const plugin = new FeishuWebhookPlugin()

    const originalFetch = globalThis.fetch
    ;(globalThis as any).fetch = async () => {
      throw new Error('dry-run should not call fetch')
    }

    try {
      const result = await plugin.execute(
        {
          trigger: {},
          steps: {},
          runtime: {
            mode: 'dry-run',
            currentStepId: 'step_webhook',
            currentStepType: 'action.feishu.webhook',
            dryRun: {
              effects: [],
            },
          },
        } as any,
        {
          webhook_url: 'http://127.0.0.1/mock',
          msg_type: 'text',
          content: {
            text: 'hello dry run',
          },
        },
      )

      expect(result.success).toBe(true)
      expect((result.output as any)?.code).toBe('OK')
      expect((result.output as any)?.data?.dryRun).toBe(true)
    } finally {
      ;(globalThis as any).fetch = originalFetch
    }
  })

  await test('live 模式发送 text 消息到 webhook', async () => {
    const plugin = new FeishuWebhookPlugin()
    const mockServer = await createMockWebhookServer()

    try {
      const result = await plugin.execute(
        {
          trigger: {},
          steps: {},
          runtime: {
            mode: 'live',
            dryRun: {
              effects: [],
            },
          },
        } as any,
        {
          webhook_url: mockServer.webhookUrl,
          msg_type: 'text',
          content: {
            text: 'hello webhook',
          },
        },
      )

      expect(result.success).toBe(true)
      expect(mockServer.payloads.length).toBe(1)
      expect(mockServer.payloads[0].msg_type).toBe('text')
      expect(mockServer.payloads[0].content.text).toBe('hello webhook')
    } finally {
      await mockServer.close()
    }
  })

  await test('配置 sign_secret 时自动生成 timestamp + sign', async () => {
    const plugin = new FeishuWebhookPlugin()
    const mockServer = await createMockWebhookServer()

    try {
      const timestamp = '1599360473'
      const secret = 'demo_secret'

      const result = await plugin.execute(
        {
          trigger: {},
          steps: {},
          runtime: {
            mode: 'live',
            dryRun: {
              effects: [],
            },
          },
        } as any,
        {
          webhook_url: mockServer.webhookUrl,
          msg_type: 'text',
          content: {
            text: 'hello signed webhook',
          },
          sign_secret: secret,
          timestamp,
        },
      )

      expect(result.success).toBe(true)
      expect(mockServer.payloads.length).toBe(1)
      expect(mockServer.payloads[0].timestamp).toBe(timestamp)
      expect(mockServer.payloads[0].sign).toBe(buildSign(secret, timestamp))
    } finally {
      await mockServer.close()
    }
  })

  await test('只传 timestamp 或 sign 时返回校验错误', async () => {
    const plugin = new FeishuWebhookPlugin()

    const result = await plugin.execute(
      {
        trigger: {},
        steps: {},
        runtime: {
          mode: 'live',
          dryRun: {
            effects: [],
          },
        },
      } as any,
      {
        webhook_url: 'http://127.0.0.1/mock',
        msg_type: 'text',
        content: {
          text: 'hello',
        },
        timestamp: '1599360473',
      },
    )

    expect(result.success).toBe(false)
    expect((result.output as any)?.code).toBe('VALIDATION_ERROR')
    expect(result.error || '').toContain('timestamp and sign must be provided together')
  })

  console.log('\nAll workflow feishu webhook plugin tests passed!')
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
