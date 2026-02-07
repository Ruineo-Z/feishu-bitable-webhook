import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { workflowsDb } from '../db/workflows'
import { WorkflowConfigSchema } from '../workflow/dsl/schema'

const app = new OpenAPIHono()

// --- Schemas ---

const WorkflowListQuerySchema = z.object({
  isActive: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().optional().default(50),
  offset: z.coerce.number().optional().default(0),
})

const CreateWorkflowSchema = z.object({
  name: z.string(),
  config: WorkflowConfigSchema,
  isActive: z.boolean().optional().default(true),
})

const UpdateWorkflowSchema = z.object({
  name: z.string().optional(),
  config: WorkflowConfigSchema.optional(),
  isActive: z.boolean().optional(),
})

const WorkflowIdParamSchema = z.object({
  id: z.string(),
})

// --- Routes ---

// 1. List Workflows
app.openapi(
  createRoute({
    method: 'get',
    path: '/',
    request: {
      query: WorkflowListQuerySchema,
    },
    responses: {
      200: {
        description: 'List workflows',
      },
    },
  }),
  async (c) => {
    const query = c.req.valid('query')
    const isActive = query.isActive ? query.isActive === 'true' : undefined

    const result = await workflowsDb.findAll({
      isActive,
      limit: query.limit,
      offset: query.offset,
    })

    return c.json(result)
  }
)

// 2. Get Workflow
app.openapi(
  createRoute({
    method: 'get',
    path: '/{id}',
    request: {
      params: WorkflowIdParamSchema,
    },
    responses: {
      200: { description: 'Get workflow details' },
      404: { description: 'Workflow not found' },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param')
    const workflow = await workflowsDb.findById(id)

    if (!workflow) {
      return c.json({ error: 'Workflow not found' }, 404)
    }

    return c.json(workflow)
  }
)

// 3. Create Workflow
app.openapi(
  createRoute({
    method: 'post',
    path: '/',
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
      201: { description: 'Workflow created' },
    },
  }),
  async (c) => {
    const body = c.req.valid('json')

    try {
      const workflow = await workflowsDb.create(body.name, body.config, body.isActive)
      return c.json(workflow, 201)
    } catch (error: any) {
      return c.json({ error: error.message }, 500)
    }
  }
)

// 4. Update Workflow
app.openapi(
  createRoute({
    method: 'put',
    path: '/{id}',
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
      200: { description: 'Workflow updated' },
      404: { description: 'Workflow not found' },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param')
    const body = c.req.valid('json')

    const updated = await workflowsDb.update(id, body)

    if (!updated) {
      return c.json({ error: 'Workflow not found' }, 404)
    }

    return c.json(updated)
  }
)

// 5. Delete Workflow
app.openapi(
  createRoute({
    method: 'delete',
    path: '/{id}',
    request: {
      params: WorkflowIdParamSchema,
    },
    responses: {
      200: { description: 'Workflow deleted' },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param')
    await workflowsDb.delete(id)
    return c.json({ success: true })
  }
)

export default app
