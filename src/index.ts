import { config } from 'dotenv'
config()

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { startEventListener } from './lark'
import { executionLogsDb } from './db/execution-logs'

const app = new OpenAPIHono()

app.get('/', (c) => {
  return c.text('飞书多维表格 Webhook 服务运行中')
})

const LogsQuerySchema = z.object({
  ruleId: z.string().optional(),
  status: z.enum(['success', 'failed', 'partial']).optional(),
  operatorOpenId: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  limit: z.coerce.number().optional().default(50),
  offset: z.coerce.number().optional().default(0),
})

const GetLogSchema = z.object({
  id: z.string(),
})

const DeleteLogSchema = z.object({
  id: z.string(),
})

app.openapi(
  createRoute({
    method: 'get',
    path: '/api/logs',
    request: {
      query: LogsQuerySchema,
    },
    responses: {
      200: {
        description: '查询执行日志列表',
      },
    },
  }),
  async (c) => {
    const query = c.req.valid('query')
    const filter = {
      ruleId: query.ruleId,
      status: query.status,
      operatorOpenId: query.operatorOpenId,
      startDate: query.startDate,
      endDate: query.endDate,
    }
    const [logs, total] = await Promise.all([
      executionLogsDb.find({ ...filter, limit: query.limit, offset: query.offset }),
      executionLogsDb.count(filter),
    ])
    return c.json({
      data: logs,
      total,
      limit: query.limit,
      offset: query.offset,
    })
  }
)

app.openapi(
  createRoute({
    method: 'get',
    path: '/api/logs/{id}',
    request: {
      params: GetLogSchema,
    },
    responses: {
      200: {
        description: '获取单条日志详情',
      },
      404: {
        description: '日志不存在',
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param')
    const log = await executionLogsDb.findById(id)
    if (!log) {
      return c.json({ error: '日志不存在' }, 404)
    }
    return c.json(log)
  }
)

app.openapi(
  createRoute({
    method: 'delete',
    path: '/api/logs/{id}',
    request: {
      params: DeleteLogSchema,
    },
    responses: {
      200: {
        description: '删除日志成功',
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param')
    await executionLogsDb.delete(id)
    return c.json({ success: true })
  }
)

startEventListener()

export default {
  port: 3000,
  fetch: app.fetch,
}
