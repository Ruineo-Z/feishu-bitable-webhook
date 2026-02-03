import { config } from 'dotenv'
config()

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { startEventListener } from './lark'
import { executionLogsDb } from './db/execution-logs'
import { bitablesDb } from './db/bitables'
import client from './lark'

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

const RefreshFieldsSchema = z.object({
  id: z.string(),
})

app.openapi(
  createRoute({
    method: 'post',
    path: '/api/bitables/{id}/refresh-fields',
    request: {
      params: RefreshFieldsSchema,
    },
    responses: {
      200: {
        description: '刷新字段映射成功',
      },
      404: {
        description: '多维表格配置不存在',
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param')
    const bitable = await bitablesDb.findById(id)
    if (!bitable) {
      return c.json({ error: '多维表格配置不存在' }, 404)
    }

    try {
      // 从飞书 API 获取最新字段列表
      const res = await client.bitable.v1.appTableField.list({
        path: { app_token: bitable.app_token, table_id: bitable.table_id }
      })

      const fields = res.data?.items || []
      const mappings: Record<string, string> = {}

      for (const field of fields) {
        mappings[field.field_id!] = field.field_name!
      }

      // 更新到数据库
      await bitablesDb.update(id, { field_mappings: mappings })

      return c.json({
        success: true,
        fieldsCount: Object.keys(mappings).length,
        mappings
      })
    } catch (error) {
      return c.json({ error: `刷新失败: ${error}` }, 500)
    }
  }
)

startEventListener()

export default {
  port: 3000,
  fetch: app.fetch,
}
