import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { workflowsDb, WorkflowRecord, WorkflowSummaryRecord } from '../db/workflows'
import { WorkflowConfigSchema } from '../workflow/dsl/schema'
import {
  WorkflowScopeInput,
  applyScopeToWorkflowConfig,
  resolveScopeFromRecord,
  toDbScopeFields,
} from '../workflow/scope'
import { ok, err } from '../http/response'

// --- Schemas ---

const WorkflowListQuerySchema = z.object({
  isActive: z.enum(['true', 'false']).optional().describe('按启用状态过滤，true=启用，false=禁用'),
  limit: z.coerce.number().optional().default(50).describe('每页条数，默认 50'),
  offset: z.coerce.number().optional().default(0).describe('分页偏移量，默认 0'),
})

const WorkflowScopeSchema = z
  .object({
    type: z.literal('table').describe('表级作用域（仅支持 table）'),
    appToken: z.string().min(1).describe('绑定 app_token（示例：KaWjbBvGeaG0Fus5bwWcKLsJnfb）'),
    tableId: z.string().min(1).describe('绑定 table_id（示例：tblhV7wQW9uqdkMd）'),
  })
  .describe('工作流作用域配置（仅支持 table 作用域）')

const CreateWorkflowSchema = z.object({
  name: z.string().describe('工作流名称'),
  config: WorkflowConfigSchema.describe('工作流 DSL 配置'),
  scope: WorkflowScopeSchema.describe('工作流作用域（必填，仅支持 table）'),
  isActive: z.boolean().optional().default(true).describe('是否启用，默认 true'),
})

const UpdateWorkflowSchema = z.object({
  name: z.string().optional().describe('工作流名称'),
  config: WorkflowConfigSchema.optional().describe('工作流 DSL 配置'),
  scope: WorkflowScopeSchema.optional().describe('工作流作用域（更新后会同步到 config.trigger.config）'),
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
  scope: WorkflowScopeSchema,
  created_at: z.string(),
  updated_at: z.string(),
})

const WorkflowRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  config: WorkflowConfigSchema,
  is_active: z.boolean(),
  scope: WorkflowScopeSchema,
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

function toWorkflowSummaryResponse(record: WorkflowSummaryRecord) {
  return {
    id: record.id,
    name: record.name,
    is_active: record.is_active,
    scope: resolveScopeFromRecord(record),
    created_at: record.created_at,
    updated_at: record.updated_at,
  }
}

function toWorkflowDetailResponse(record: WorkflowRecord) {
  return {
    id: record.id,
    name: record.name,
    config: record.config,
    is_active: record.is_active,
    scope: resolveScopeFromRecord(record),
    created_at: record.created_at,
    updated_at: record.updated_at,
  }
}

function isTableScopeRequiredError(error: unknown): boolean {
  return error instanceof Error && error.message === 'WORKFLOW_SCOPE_TABLE_BINDING_REQUIRED'
}

// --- Routes Registration ---

export default function registerWorkflowRoutes(app: OpenAPIHono) {
  // 1. List Workflows
  app.openapi(
    createRoute({
      method: 'get',
      path: '/api/workflows',
      tags: ['Workflows'],
      summary: '查询工作流列表',
      description: '按启用状态筛选工作流，并支持分页查询。列表返回摘要信息与 table scope。',
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

        return ok(
          c,
          result.data.map(toWorkflowSummaryResponse),
          '查询工作流列表成功',
          200,
          {
            pagination: {
              total: result.total,
              limit: query.limit,
              offset: query.offset,
            },
          },
        )
      } catch {
        return err(c, 'WORKFLOW_LIST_FAILED', '查询工作流列表失败', 500)
      }
    }) as any,
  )

  // 2. Get Workflow
  app.openapi(
    createRoute({
      method: 'get',
      path: '/api/workflows/{id}',
      tags: ['Workflows'],
      summary: '查询工作流详情',
      description: '根据工作流 ID 获取完整工作流配置与 table 作用域。',
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

        return ok(c, toWorkflowDetailResponse(workflow), '查询工作流详情成功')
      } catch {
        return err(c, 'WORKFLOW_GET_FAILED', '查询工作流详情失败', 500)
      }
    }) as any,
  )

  // 3. Create Workflow
  app.openapi(
    createRoute({
      method: 'post',
      path: '/api/workflows',
      tags: ['Workflows'],
      summary: '创建工作流',
      description: '根据请求体中的名称、DSL 配置与 table 作用域创建新工作流。',
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
        400: {
          description: '请求参数不合法',
          content: {
            'application/json': {
              schema: ErrorEnvelopeSchema,
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
        const scope = body.scope as WorkflowScopeInput
        const normalizedConfig = applyScopeToWorkflowConfig(body.config, scope)

        const workflow = await workflowsDb.create(
          body.name,
          normalizedConfig,
          body.isActive,
          scope,
        )

        return ok(c, toWorkflowDetailResponse(workflow), '创建工作流成功', 201)
      } catch (error) {
        if (isTableScopeRequiredError(error)) {
          return err(c, 'WORKFLOW_SCOPE_TABLE_REQUIRED', '仅支持 table 作用域，必须提供 appToken 与 tableId', 400)
        }

        return err(c, 'WORKFLOW_CREATE_FAILED', '创建工作流失败', 500)
      }
    }) as any,
  )

  // 4. Update Workflow
  app.openapi(
    createRoute({
      method: 'put',
      path: '/api/workflows/{id}',
      tags: ['Workflows'],
      summary: '更新工作流',
      description:
        '根据工作流 ID 更新名称、配置、作用域或启用状态。更新时会保证 scope 与 config.trigger.config 一致。',
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
        400: {
          description: '请求参数不合法',
          content: {
            'application/json': {
              schema: ErrorEnvelopeSchema,
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

        const existing = await workflowsDb.findById(id)
        if (!existing) {
          return err(c, 'WORKFLOW_NOT_FOUND', '工作流不存在', 404)
        }

        const effectiveScope: WorkflowScopeInput =
          (body.scope as WorkflowScopeInput | undefined) || resolveScopeFromRecord(existing)
        const sourceConfig = body.config || existing.config
        const normalizedConfig = applyScopeToWorkflowConfig(sourceConfig, effectiveScope)
        const scopeFields = toDbScopeFields(effectiveScope)

        const updates: {
          name?: string
          config: z.infer<typeof WorkflowConfigSchema>
          is_active?: boolean
          scope_type: 'table'
          app_token: string
          table_id: string
        } = {
          config: normalizedConfig,
          scope_type: scopeFields.scope_type,
          app_token: scopeFields.app_token,
          table_id: scopeFields.table_id,
        }

        if (body.name !== undefined) updates.name = body.name
        if (body.isActive !== undefined) updates.is_active = body.isActive

        const updated = await workflowsDb.update(id, updates)

        if (!updated) {
          return err(c, 'WORKFLOW_NOT_FOUND', '工作流不存在', 404)
        }

        return ok(c, toWorkflowDetailResponse(updated), '更新工作流成功')
      } catch (error) {
        if (isTableScopeRequiredError(error)) {
          return err(c, 'WORKFLOW_SCOPE_TABLE_REQUIRED', '仅支持 table 作用域，必须提供 appToken 与 tableId', 400)
        }

        return err(c, 'WORKFLOW_UPDATE_FAILED', '更新工作流失败', 500)
      }
    }) as any,
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
    }) as any,
  )
}
