import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { workflowsDb } from '../db/workflows'
import { WorkflowConfigSchema } from '../workflow/dsl/schema'
import { ok, err } from '../http/response'

// --- Schemas ---

const WorkflowListQuerySchema = z.object({
  isActive: z.enum(['true', 'false']).optional().describe('按启用状态过滤，true=启用，false=禁用'),
  limit: z.coerce.number().optional().default(50).describe('每页条数，默认 50'),
  offset: z.coerce.number().optional().default(0).describe('分页偏移量，默认 0'),
})

const CreateWorkflowSchema = z.object({
  name: z.string().describe('工作流名称'),
  config: WorkflowConfigSchema.describe('工作流 DSL 配置'),
  isActive: z.boolean().optional().default(true).describe('是否启用，默认 true'),
})

const UpdateWorkflowSchema = z.object({
  name: z.string().optional().describe('工作流名称'),
  config: WorkflowConfigSchema.optional().describe('工作流 DSL 配置'),
  isActive: z.boolean().optional().describe('是否启用'),
})

const WorkflowIdParamSchema = z.object({
  id: z.string().describe('工作流 ID'),
})

const ErrorEnvelopeSchema = z.object({
  code: z.string().describe('错误码'),
  message: z.string().describe('错误信息'),
  details: z.unknown().optional().describe('错误细节'),
})

const PaginationMetaSchema = z.object({
  pagination: z.object({
    total: z.number(),
    limit: z.number(),
    offset: z.number(),
  }),
})

const WorkflowSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  is_active: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
})

const WorkflowRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  config: WorkflowConfigSchema,
  is_active: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
})

const WorkflowListSuccessSchema = z.object({
  code: z.literal('OK'),
  message: z.string(),
  data: z.array(WorkflowSummarySchema),
  meta: PaginationMetaSchema,
})

const WorkflowSuccessSchema = z.object({
  code: z.literal('OK'),
  message: z.string(),
  data: WorkflowRecordSchema,
})

const WorkflowDeleteSuccessSchema = z.object({
  code: z.literal('OK'),
  message: z.string(),
  data: z.object({ id: z.string() }),
})

// --- Routes Registration ---

export default function registerWorkflowRoutes(app: OpenAPIHono) {
  // 1. List Workflows
  app.openapi(
    createRoute({
      method: 'get',
      path: '/api/workflows',
      tags: ['Workflows'],
      summary: '查询工作流列表',
      description: '按启用状态筛选工作流，并支持分页查询。列表仅返回摘要信息，不包含完整 config。',
      request: {
        query: WorkflowListQuerySchema,
      },
      responses: {
        200: {
          description: '查询成功',
          content: {
            'application/json': {
              schema: WorkflowListSuccessSchema,
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
        const isActive = query.isActive ? query.isActive === 'true' : undefined

        const result = await workflowsDb.findAll({
          isActive,
          limit: query.limit,
          offset: query.offset,
        })

        return ok(c, result.data, '查询工作流列表成功', 200, {
          pagination: {
            total: result.total,
            limit: query.limit,
            offset: query.offset,
          },
        })
      } catch {
        return err(c, 'WORKFLOW_LIST_FAILED', '查询工作流列表失败', 500)
      }
    }) as any
  )

  // 2. Get Workflow
  app.openapi(
    createRoute({
      method: 'get',
      path: '/api/workflows/{id}',
      tags: ['Workflows'],
      summary: '查询工作流详情',
      description: '根据工作流 ID 获取完整工作流配置。',
      request: {
        params: WorkflowIdParamSchema,
      },
      responses: {
        200: {
          description: '查询成功',
          content: {
            'application/json': {
              schema: WorkflowSuccessSchema,
            },
          },
        },
        404: {
          description: '工作流不存在',
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
        const workflow = await workflowsDb.findById(id)

        if (!workflow) {
          return err(c, 'WORKFLOW_NOT_FOUND', '工作流不存在', 404)
        }

        return ok(c, workflow, '查询工作流详情成功')
      } catch {
        return err(c, 'WORKFLOW_GET_FAILED', '查询工作流详情失败', 500)
      }
    }) as any
  )

  // 3. Create Workflow
  app.openapi(
    createRoute({
      method: 'post',
      path: '/api/workflows',
      tags: ['Workflows'],
      summary: '创建工作流',
      description: '根据请求体中的名称和 DSL 配置创建新工作流。',
      request: {
        body: {
          content: {
            'application/json': {
              schema: CreateWorkflowSchema,
            },
          },
        },
      },
      responses: {
        201: {
          description: '创建成功',
          content: {
            'application/json': {
              schema: WorkflowSuccessSchema,
            },
          },
        },
        500: {
          description: '创建失败',
          content: {
            'application/json': {
              schema: ErrorEnvelopeSchema,
            },
          },
        },
      },
    }),
    (async (c: any) => {
      const body = c.req.valid('json')

      try {
        const workflow = await workflowsDb.create(body.name, body.config, body.isActive)
        return ok(c, workflow, '创建工作流成功', 201)
      } catch (error: any) {
        return err(c, 'WORKFLOW_CREATE_FAILED', '创建工作流失败', 500)
      }
    }) as any
  )

  // 4. Update Workflow
  app.openapi(
    createRoute({
      method: 'put',
      path: '/api/workflows/{id}',
      tags: ['Workflows'],
      summary: '更新工作流',
      description: '根据工作流 ID 更新名称、配置或启用状态。',
      request: {
        params: WorkflowIdParamSchema,
        body: {
          content: {
            'application/json': {
              schema: UpdateWorkflowSchema,
            },
          },
        },
      },
      responses: {
        200: {
          description: '更新成功',
          content: {
            'application/json': {
              schema: WorkflowSuccessSchema,
            },
          },
        },
        404: {
          description: '工作流不存在',
          content: {
            'application/json': {
              schema: ErrorEnvelopeSchema,
            },
          },
        },
        500: {
          description: '更新失败',
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
        const body = c.req.valid('json')

        const updates: {
          name?: string
          config?: z.infer<typeof WorkflowConfigSchema>
          is_active?: boolean
        } = {}

        if (body.name !== undefined) updates.name = body.name
        if (body.config !== undefined) updates.config = body.config
        if (body.isActive !== undefined) updates.is_active = body.isActive

        const updated = await workflowsDb.update(id, updates)

        if (!updated) {
          return err(c, 'WORKFLOW_NOT_FOUND', '工作流不存在', 404)
        }

        return ok(c, updated, '更新工作流成功')
      } catch {
        return err(c, 'WORKFLOW_UPDATE_FAILED', '更新工作流失败', 500)
      }
    }) as any
  )

  // 5. Delete Workflow
  app.openapi(
    createRoute({
      method: 'delete',
      path: '/api/workflows/{id}',
      tags: ['Workflows'],
      summary: '删除工作流',
      description: '根据工作流 ID 删除指定工作流。',
      request: {
        params: WorkflowIdParamSchema,
      },
      responses: {
        200: {
          description: '删除成功',
          content: {
            'application/json': {
              schema: WorkflowDeleteSuccessSchema,
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
        await workflowsDb.delete(id)
        return ok(c, { id }, '删除工作流成功')
      } catch {
        return err(c, 'WORKFLOW_DELETE_FAILED', '删除工作流失败', 500)
      }
    }) as any
  )
}
