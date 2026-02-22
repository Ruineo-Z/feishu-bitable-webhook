import { executionLogsDb } from '../../src/db/execution-logs'

function expect(actual: unknown) {
  return {
    toBe(expected: unknown) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`)
      }
    },
  }
}

const FAILED_LOG_FIXTURE = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  workflow_id: '33333333-3333-4333-8333-333333333333',
  rule_id: null,
  rule_name: 'workflow:rejected-demo',
  trigger_action: 'record_updated',
  record_id: 'rec_failed_demo',
  operator_openid: 'ou_demo',
  record_snapshot: {
    fields: { 标题: 'after' },
    beforeFields: { 标题: 'before' },
  },
  status: 'failed',
  error_message: 'plugin exploded',
  duration_ms: null,
  response: {
    workflowId: '33333333-3333-4333-8333-333333333333',
    source: 'table',
    routedEventType: 'record_updated',
    business_status: 'unknown',
    trigger_action: 'record_updated',
    error: {
      name: 'Error',
      message: 'plugin exploded',
    },
  },
  created_at: new Date().toISOString(),
}

async function run() {
  console.log('Logs Route Regression Tests\n')

  process.env.DISABLE_EVENT_LISTENER = 'true'
  const appModule = await import('../../src/index')
  const app = appModule.default

  const originFind = executionLogsDb.find
  const originCount = executionLogsDb.count
  const originFindById = executionLogsDb.findById

  let capturedListFilter: Record<string, unknown> | null = null
  let capturedCountFilter: Record<string, unknown> | null = null

  executionLogsDb.find = async (filter: any) => {
    capturedListFilter = filter
    return [FAILED_LOG_FIXTURE as any]
  }
  executionLogsDb.count = async (filter: any) => {
    capturedCountFilter = filter
    return 1
  }
  executionLogsDb.findById = async (_id: string) => {
    return FAILED_LOG_FIXTURE as any
  }

  try {
    const listRes = await app.fetch(
      new Request('http://localhost/api/logs?workflowId=33333333-3333-4333-8333-333333333333&status=failed&limit=10&offset=0'),
    )
    expect(listRes.status).toBe(200)
    const listBody = await listRes.json() as any

    expect((capturedListFilter || {}).workflowId).toBe('33333333-3333-4333-8333-333333333333')
    expect((capturedCountFilter || {}).workflowId).toBe('33333333-3333-4333-8333-333333333333')
    expect(listBody.data.length).toBe(1)
    expect(listBody.data[0].workflow_id).toBe('33333333-3333-4333-8333-333333333333')
    expect(listBody.data[0].status).toBe('failed')
    expect(listBody.data[0].response.business_status).toBe('unknown')
    console.log('✓ /api/logs 支持 workflowId 过滤且失败日志字段可见')

    const detailRes = await app.fetch(
      new Request(`http://localhost/api/logs/${FAILED_LOG_FIXTURE.id}`),
    )
    expect(detailRes.status).toBe(200)
    const detailBody = await detailRes.json() as any
    expect(detailBody.data.id).toBe(FAILED_LOG_FIXTURE.id)
    expect(detailBody.data.response.business_status).toBe('unknown')
    console.log('✓ /api/logs/{id} 返回技术态与业务态字段')

    console.log('\nAll logs route regression tests passed!')
  } finally {
    executionLogsDb.find = originFind
    executionLogsDb.count = originCount
    executionLogsDb.findById = originFindById
  }
}

run()
  .then(() => {
    process.exit(0)
  })
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
