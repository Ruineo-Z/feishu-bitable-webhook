import { config } from 'dotenv'
config()

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { swaggerUI } from '@hono/swagger-ui'
import { startEventListener } from './lark'
import { executionLogsDb } from './db/execution-logs'
import { fieldMappingsDb } from './db/field-mappings'
import { refreshFieldMappingsByTable } from './services/field-mappings'
import registerWorkflowRoutes from './routes/workflow'
import { ok, err } from './http/response'

const app = new OpenAPIHono()

registerWorkflowRoutes(app)

app.doc('/doc', {
  openapi: '3.0.0',
  info: {
    version: '1.0.0',
    title: 'Feishu Bitable Webhook API',
    description: 'API documentation for the workflow-only runtime with field mapping registry.',
  },
})

app.get('/docs', swaggerUI({ url: '/doc' }))

app.routes.forEach(r => {
  console.log(`[ROUTE] ${r.method} ${r.path}`)
})

app.get('/', (c) => {
  return c.text('飞书多维表格 Webhook 服务运行中')
})

const LogsQuerySchema = z.object({
  ruleId: z.string().optional().describe('按规则 ID 过滤；workflow-only 模式下可为空'),
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

const MappingListQuerySchema = z.object({
  appToken: z.string().min(1).describe('多维表格 app_token'),
  tableId: z.string().min(1).describe('数据表 table_id'),
})

const MappingRefreshSchema = z.object({
  appToken: z.string().min(1).describe('多维表格 app_token'),
  tableId: z.string().min(1).describe('数据表 table_id'),
})

const MappingListSuccessSchema = z.object({
  code: z.literal('OK'),
  message: z.string(),
  data: z.object({
    appToken: z.string(),
    tableId: z.string(),
    fieldsCount: z.number(),
    mappings: z.record(z.string()),
  }),
})

const MappingRefreshSuccessSchema = z.object({
  code: z.literal('OK'),
  message: z.string(),
  data: z.object({
    appToken: z.string(),
    tableId: z.string(),
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

app.openapi(
  createRoute({
    method: 'get',
    path: '/api/mappings',
    tags: ['FieldMappings'],
    summary: '查询字段映射',
    description: '按 app_token + table_id 查询字段映射 registry（workflow-only 推荐接口）。',
    request: {
      query: MappingListQuerySchema,
    },
    responses: {
      200: {
        description: '查询成功',
        content: {
          'application/json': {
            schema: MappingListSuccessSchema,
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
      const records = await fieldMappingsDb.findByTable(query.appToken, query.tableId)
      const mappings = records.reduce<Record<string, string>>((acc, record) => {
        acc[record.field_id] = record.field_name
        return acc
      }, {})

      return ok(c, {
        appToken: query.appToken,
        tableId: query.tableId,
        fieldsCount: records.length,
        mappings,
      }, '查询字段映射成功')
    } catch {
      return err(c, 'FIELD_MAPPING_GET_FAILED', '查询字段映射失败', 500)
    }
  }) as any
)

app.openapi(
  createRoute({
    method: 'post',
    path: '/api/mappings/refresh',
    tags: ['FieldMappings'],
    summary: '刷新字段映射',
    description: '按 app_token + table_id 从飞书拉取最新字段定义并重建 mapping registry。',
    request: {
      body: {
        content: {
          'application/json': {
            schema: MappingRefreshSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: '刷新成功',
        content: {
          'application/json': {
            schema: MappingRefreshSuccessSchema,
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
    try {
      const body = c.req.valid('json')
      const result = await refreshFieldMappingsByTable(body.appToken, body.tableId)
      return ok(c, result, '刷新字段映射成功')
    } catch (error) {
      return err(c, 'FIELD_MAPPING_REFRESH_FAILED', '刷新字段映射失败', 500, error)
    }
  }) as any
)

startEventListener()

export default {
  port: 3333,
  fetch: app.fetch,
}
