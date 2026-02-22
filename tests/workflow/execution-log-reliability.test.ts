import { __testing } from '../../src/lark'

function expect(actual: unknown) {
  return {
    toBe(expected: unknown) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`)
      }
    },
    toBeGreaterThan(expected: number) {
      if (typeof actual !== 'number' || actual <= expected) {
        throw new Error(`Expected ${JSON.stringify(actual)} > ${expected}`)
      }
    },
  }
}

function buildExecutionLog(seed: string) {
  return {
    workflow_id: '11111111-1111-4111-8111-111111111111',
    rule_id: null,
    rule_name: `workflow:test-${seed}`,
    trigger_action: 'record_updated',
    record_id: `rec_${seed}`,
    operator_openid: null,
    record_snapshot: {
      fields: {
        标题: `测试-${seed}`,
      },
      beforeFields: {
        标题: `测试-before-${seed}`,
      },
    },
    status: 'success',
    error_message: null,
    duration_ms: null,
    response: {
      workflowId: '11111111-1111-4111-8111-111111111111',
      business_status: 'matched',
    },
  }
}

async function testRetryableFlush() {
  __testing.resetExecutionLogQueue()

  const inserted: any[] = []
  let attempts = 0
  __testing.setExecutionLogWriter(async (logs) => {
    attempts += 1
    if (attempts === 1) {
      throw new Error('transient_failure')
    }
    inserted.push(...logs)
  })

  __testing.queueExecutionLog(buildExecutionLog('retry'))

  const firstFlush = await __testing.flushExecutionLogs({
    reason: 'manual-retry-test',
    force: true,
  })
  expect(firstFlush.success).toBe(false)
  expect(__testing.getLogQueueDiagnostics().size).toBe(1)

  const secondFlush = await __testing.flushExecutionLogs({
    reason: 'manual-retry-test',
    force: true,
  })
  expect(secondFlush.success).toBe(true)
  expect(inserted.length).toBe(1)
  expect(__testing.getLogQueueDiagnostics().size).toBe(0)
}

async function testDrainBeforeExit() {
  __testing.resetExecutionLogQueue()

  const inserted: any[] = []
  let attempts = 0
  __testing.setExecutionLogWriter(async (logs) => {
    attempts += 1
    if (attempts === 1) {
      throw new Error('temporary_outage')
    }
    inserted.push(...logs)
  })

  __testing.queueExecutionLog(buildExecutionLog('drain-a'))
  __testing.queueExecutionLog(buildExecutionLog('drain-b'))

  const drainResult = await __testing.drainExecutionLogs('unit-test', 2500)
  expect(drainResult.timedOut).toBe(false)
  expect(drainResult.drainedCount).toBe(2)
  expect(drainResult.attempts).toBeGreaterThan(1)
  expect(__testing.getLogQueueDiagnostics().size).toBe(0)
  expect(inserted.length).toBe(2)
}

async function testRejectedExecutionLogPayload() {
  __testing.resetExecutionLogQueue()

  const inserted: any[] = []
  __testing.setExecutionLogWriter(async (logs) => {
    inserted.push(...logs)
  })

  __testing.queueRejectedWorkflowExecutionLog({
    workflowId: '22222222-2222-4222-8222-222222222222',
    workflowName: 'rejected-workflow',
    source: 'table',
    triggerAction: 'record_updated',
    recordId: 'rec_rejected',
    operatorOpenId: 'ou_test',
    fieldsAfter: { 标题: 'A' },
    fieldsBefore: { 标题: 'B' },
    routedEventType: 'record_updated',
    traceId: 'EVT-TEST-REJECTED',
    error: new Error('plugin exploded'),
  })

  const flushResult = await __testing.flushExecutionLogs({
    reason: 'manual-rejected-test',
    force: true,
  })
  expect(flushResult.success).toBe(true)
  expect(inserted.length).toBe(1)
  expect(inserted[0].status).toBe('failed')
  expect(inserted[0].workflow_id).toBe('22222222-2222-4222-8222-222222222222')
  expect(inserted[0].response.business_status).toBe('unknown')
  expect(inserted[0].response.trigger_action).toBe('record_updated')
}

async function run() {
  console.log('Execution Log Reliability Tests\n')

  try {
    await testRetryableFlush()
    console.log('✓ flush 失败可回队并重试成功')

    await testDrainBeforeExit()
    console.log('✓ drain 可在超时窗口内冲刷成功')

    await testRejectedExecutionLogPayload()
    console.log('✓ rejected 执行可生成结构化 failed 日志')

    console.log('\nAll execution log reliability tests passed!')
  } finally {
    __testing.setExecutionLogWriter(null)
    __testing.resetExecutionLogQueue()
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
