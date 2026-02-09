import { config } from 'dotenv'
config()

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { swaggerUI } from '@hono/swagger-ui'
import { startEventListener } from './lark'
import { executionLogsDb } from './db/execution-logs'
import { bitablesDb } from './db/bitables'
import { client } from './client'
import registerWorkflowRoutes from './routes/workflow'
import { ok, err } from './http/response'

const app = new OpenAPIHono()

registerWorkflowRoutes(app)

app.doc('/doc', {
  openapi: '3.0.0',
  info: {
    version: '1.0.0',
    title: 'Feishu Bitable Webhook API',
    description: 'API documentation for the User-Defined Workflow Engine',
  },
})

app.get('/docs', swaggerUI({ url: '/doc' }))

// Debug: Print all registered routes
app.routes.forEach(r => {
  console.log(`[ROUTE] ${r.method} ${r.path}`)
})

app.get('/', (c) => {
  return c.text('飞书多维表格 Webhook 服务运行中')
})

const LogsQuerySchema = z.object({
  ruleId: z.string().optional().describe('按规则 ID 过滤'),
  status: z.enum(['success', 'failed', 'partial']).optional().describe('按执行状态过滤'),
  operatorOpenId: z.string().optional().describe('按操作人 Open ID 过滤'),
  startDate: z.string().optional().describe('开始时间（ISO 8601）'),
  endDate: z.string().optional().describe('结束时间（ISO 8601）'),
  limit: z.coerce.number().optional().default(50).describe('每页条数，默认 50'),
  offset: z.coerce.number().optional().default(0).describe('分页偏移量，默认 0'),
})

const GetLogSchema = z.object({
  id: z.string().describe('执行日志 ID'),
})

const DeleteLogSchema = z.object({
  id: z.string().describe('执行日志 ID'),
})

const ErrorEnvelopeSchema = z.object({
  code: z.string().describe('错误码'),
  message: z.string().describe('错误信息'),
  details: z.unknown().optional().describe('错误细节'),
})

const LogRecordSchema = z.object({
  id: z.string(),
  rule_id: z.string().nullable(),
  rule_name: z.string().nullable(),
  trigger_action: z.string(),
  record_id: z.string(),
  operator_openid: z.string().nullable(),
  record_snapshot: z.unknown().nullable(),
  status: z.string(),
  error_message: z.string().nullable(),
  duration_ms: z.number().nullable(),
  response: z.unknown().nullable(),
  created_at: z.string(),
})

const LogsListSuccessSchema = z.object({
  code: z.literal('OK'),
  message: z.string(),
  data: z.array(LogRecordSchema),
  meta: z.object({
    pagination: z.object({
      total: z.number(),
      limit: z.number(),
      offset: z.number(),
    }),
  }),
})

const LogSuccessSchema = z.object({
  code: z.literal('OK'),
  message: z.string(),
  data: LogRecordSchema,
})

const DeleteSuccessSchema = z.object({
  code: z.literal('OK'),
  message: z.string(),
  data: z.object({ id: z.string() }),
})

const RefreshFieldsSuccessSchema = z.object({
  code: z.literal('OK'),
  message: z.string(),
  data: z.object({
    success: z.boolean(),
    fieldsCount: z.number(),
    mappings: z.record(z.string()),
  }),
})

app.openapi(
  createRoute({
    method: 'get',
    path: '/api/logs',
    tags: ['Logs'],
    summary: '查询执行日志列表',
    description: '按规则、状态、操作人和时间范围筛选执行日志，并支持分页。',
    request: {
      query: LogsQuerySchema,
    },
    responses: {
      200: {
        description: '查询成功',
        content: {
          'application/json': {
            schema: LogsListSuccessSchema,
          },
        },
      },
      400: {
        description: '请求参数不合法',
        content: {
          'application/json': {
            schema: ErrorEnvelopeSchema,
          },
        },
      },
      500: {
        description: '查询失败',
        content: {
          'application/json': {
            schema: ErrorEnvelopeSchema,
          },
        },
      },
    },
  }),
  (async (c: any) => {
    try {
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
      return ok(c, logs, '查询执行日志列表成功', 200, {
        pagination: {
          total,
          limit: query.limit,
          offset: query.offset,
        },
      })
    } catch {
      return err(c, 'LOG_LIST_FAILED', '查询执行日志列表失败', 500)
    }
  }) as any
)

app.openapi(
  createRoute({
    method: 'get',
    path: '/api/logs/{id}',
    tags: ['Logs'],
    summary: '查询执行日志详情',
    description: '根据日志 ID 获取单条执行日志的完整信息。',
    request: {
      params: GetLogSchema,
    },
    responses: {
      200: {
        description: '查询成功',
        content: {
          'application/json': {
            schema: LogSuccessSchema,
          },
        },
      },
      404: {
        description: '日志不存在',
        content: {
          'application/json': {
            schema: ErrorEnvelopeSchema,
          },
        },
      },
      500: {
        description: '查询失败',
        content: {
          'application/json': {
            schema: ErrorEnvelopeSchema,
          },
        },
      },
    },
  }),
  (async (c: any) => {
    try {
      const { id } = c.req.valid('param')
      const log = await executionLogsDb.findById(id)
      if (!log) {
        return err(c, 'LOG_NOT_FOUND', '日志不存在', 404)
      }
      return ok(c, log, '查询执行日志详情成功')
    } catch {
      return err(c, 'LOG_GET_FAILED', '查询执行日志详情失败', 500)
    }
  }) as any
)

app.openapi(
  createRoute({
    method: 'delete',
    path: '/api/logs/{id}',
    tags: ['Logs'],
    summary: '删除执行日志',
    description: '根据日志 ID 删除指定执行日志。',
    request: {
      params: DeleteLogSchema,
    },
    responses: {
      200: {
        description: '删除成功',
        content: {
          'application/json': {
            schema: DeleteSuccessSchema,
          },
        },
      },
      500: {
        description: '删除失败',
        content: {
          'application/json': {
            schema: ErrorEnvelopeSchema,
          },
        },
      },
    },
  }),
  (async (c: any) => {
    try {
      const { id } = c.req.valid('param')
      await executionLogsDb.delete(id)
      return ok(c, { id }, '删除执行日志成功')
    } catch {
      return err(c, 'LOG_DELETE_FAILED', '删除执行日志失败', 500)
    }
  }) as any
)

const RefreshFieldsSchema = z.object({
  id: z.string().describe('多维表格配置 ID'),
})

app.openapi(
  createRoute({
    method: 'post',
    path: '/api/bitables/{id}/refresh-fields',
    tags: ['Bitables'],
    summary: '刷新多维表格字段映射',
    description: '根据配置 ID 从飞书拉取最新字段，并更新数据库中的字段映射。',
    request: {
      params: RefreshFieldsSchema,
    },
    responses: {
      200: {
        description: '刷新成功',
        content: {
          'application/json': {
            schema: RefreshFieldsSuccessSchema,
          },
        },
      },
      404: {
        description: '多维表格配置不存在',
        content: {
          'application/json': {
            schema: ErrorEnvelopeSchema,
          },
        },
      },
      500: {
        description: '刷新失败',
        content: {
          'application/json': {
            schema: ErrorEnvelopeSchema,
          },
        },
      },
    },
  }),
  (async (c: any) => {
    const { id } = c.req.valid('param')
    const bitable = await bitablesDb.findById(id)
    if (!bitable) {
      return err(c, 'BITABLE_NOT_FOUND', '多维表格配置不存在', 404)
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

      return ok(c, {
        success: true,
        fieldsCount: Object.keys(mappings).length,
        mappings
      }, '刷新字段映射成功')
    } catch (error) {
      return err(c, 'REFRESH_FIELDS_FAILED', '刷新字段映射失败', 500)
    }
  }) as any
)

startEventListener()

export default {
  port: 3000,
  fetch: app.fetch,
}
