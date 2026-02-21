import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { workflowsDb, WorkflowRecord, WorkflowSummaryRecord } from '../db/workflows'
import { WorkflowConfigSchema } from '../workflow/dsl/schema'
import {
  WORKFLOW_EVENT_TYPES,
  WORKFLOW_SCOPE_EVENT_TYPES_INVALID,
  WORKFLOW_SCOPE_TABLE_BINDING_REQUIRED,
  WORKFLOW_SCOPE_TRIGGER_EVENT_TYPES_CONFLICT,
  WorkflowEventType,
  WorkflowScopeInput,
  normalizeScopeAndTriggerConfig,
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

const WorkflowEventTypeSchema = z.enum(WORKFLOW_EVENT_TYPES)

const WorkflowScopeSchema = z
  .object({
    type: z.literal('table').describe('表级作用域（仅支持 table）'),
    appToken: z.string().min(1).describe('绑定 app_token（示例：KaWjbBvGeaG0Fus5bwWcKLsJnfb）'),
    tableId: z.string().min(1).describe('绑定 table_id（示例：tblhV7wQW9uqdkMd）'),
    eventTypes: z
      .array(WorkflowEventTypeSchema)
      .optional()
      .describe('可选事件过滤，未配置表示匹配该表全部记录事件'),
  })
  .describe('工作流作用域配置（仅支持 table 作用域）')

const CreateWorkflowSchema = z.object({
  name: z.string().describe('工作流名称'),
  config: WorkflowConfigSchema.describe('Workflow DSL（支持 DAG 分支）配置'),
  scope: WorkflowScopeSchema.describe('工作流作用域（必填，仅支持 table）'),
  isActive: z.boolean().optional().default(true).describe('是否启用，默认 true'),
})

const UpdateWorkflowSchema = z.object({
  name: z.string().optional().describe('工作流名称'),
  config: WorkflowConfigSchema.optional().describe('Workflow DSL（支持 DAG 分支）配置'),
  scope: WorkflowScopeSchema.optional().describe('工作流作用域（更新后会同步到 config.trigger.config）'),
  isActive: z.boolean().optional().describe('是否启用'),
})

const WorkflowCreateExamples = {
  tableAllEvents: {
    summary: 'table scope（匹配全部事件）',
    value: {
      name: '创建后通知',
      scope: {
        type: 'table',
        appToken: 'app_token_demo',
        tableId: 'tbl_demo',
      },
      isActive: true,
      config: {
        id: 'wf_create_notify',
        name: '创建后通知',
        trigger: {
          type: 'lark.bitable.record.changed',
          config: {
            app_token: 'app_token_demo',
            table_id: 'tbl_demo',
          },
        },
        steps: [
          {
            id: 'step_notify',
            type: 'action.feishu.message',
            config: {
              receive_id: 'ou_xxx',
              receive_id_type: 'open_id',
              msg_type: 'text',
              content: '{"text":"记录发生变化：${trigger.record.fields.标题}"}',
            },
          },
        ],
      },
    },
  },
  tableWithEventTypesAndBranching: {
    summary: 'table scope + eventTypes + if/else 分支',
    value: {
      name: '更新状态分支通知',
      scope: {
        type: 'table',
        appToken: 'app_token_demo',
        tableId: 'tbl_demo',
        eventTypes: ['record_updated'],
      },
      isActive: true,
      config: {
        id: 'wf_branching_notify',
        name: '更新状态分支通知',
        trigger: {
          type: 'lark.bitable.record.changed',
          config: {
            app_token: 'app_token_demo',
            table_id: 'tbl_demo',
            actions: ['record_updated'],
          },
        },
        steps: [
          {
            id: 'step_condition',
            type: 'condition',
            config: {
              logic: 'AND',
              expressions: [{ field: '状态', operator: 'equals', value: '已完成' }],
            },
            onTrue: 'step_notify_done',
            onFalse: 'step_notify_pending',
          },
          {
            id: 'step_notify_done',
            type: 'action.feishu.message',
            config: {
              receive_id: 'ou_xxx',
              receive_id_type: 'open_id',
              msg_type: 'text',
              content: '{"text":"记录已完成：${trigger.record.fields.标题}"}',
            },
          },
          {
            id: 'step_notify_pending',
            type: 'action.feishu.message',
            config: {
              receive_id: 'ou_xxx',
              receive_id_type: 'open_id',
              msg_type: 'text',
              content: '{"text":"记录未完成：${trigger.record.fields.标题}"}',
            },
          },
        ],
      },
    },
  },
  sourceAwareGuardWithTemplatePolicy: {
    summary: 'before/after 来源 + step.when + templatePolicy',
    value: {
      name: 'A负责人变更同步到B',
      scope: {
        type: 'table',
        appToken: 'KaWjbBvGeaG0Fus5bwWcKLsJnfb',
        tableId: 'tbl6VxIEVkc1eY3S',
        eventTypes: ['record_updated'],
      },
      isActive: true,
      config: {
        id: 'wf_sync_owner_a_to_b_001',
        name: 'A负责人变更同步到B',
        trigger: {
          type: 'lark.bitable.record.changed',
          config: {
            app_token: 'KaWjbBvGeaG0Fus5bwWcKLsJnfb',
            table_id: 'tbl6VxIEVkc1eY3S',
            actions: ['record_updated'],
          },
        },
        steps: [
          {
            id: 'c1',
            type: 'condition',
            name: '负责人变化且昵称非空',
            config: {
              logic: 'AND',
              expressions: [
                { field: '账号第一负责人', operator: 'changed', source: 'after' },
                { field: '账号当前昵称', operator: 'exists', source: 'after' },
              ],
            },
            onTrue: 'd1',
            onFalse: 'end',
          },
          {
            id: 'd1',
            type: 'action.bitable.delete',
            name: '旧负责人有值才删除',
            templatePolicy: 'skip',
            when: {
              logic: 'AND',
              expressions: [{ field: '账号第一负责人', operator: 'exists', source: 'before' }],
            },
            config: {
              app_token: 'KaWjbBvGeaG0Fus5bwWcKLsJnfb',
              table_id: 'tblhV7wQW9uqdkMd',
              filter: {
                conjunction: 'and',
                conditions: [
                  { field_name: '第一负责人', operator: 'is', value: '${trigger.record.beforeFields.账号第一负责人}' },
                  { field_name: '账号当前昵称', operator: 'is', value: '${trigger.record.fields.账号当前昵称}' },
                ],
              },
            },
            next: 'c2',
          },
          {
            id: 'c2',
            type: 'condition',
            name: '变更后负责人有值才创建',
            config: {
              logic: 'AND',
              expressions: [{ field: '账号第一负责人', operator: 'exists', source: 'after' }],
            },
            onTrue: 'a1',
            onFalse: 'end',
          },
          {
            id: 'a1',
            type: 'action.bitable.create',
            templatePolicy: 'fail',
            config: {
              app_token: 'KaWjbBvGeaG0Fus5bwWcKLsJnfb',
              table_id: 'tblhV7wQW9uqdkMd',
              fields: {
                第一负责人: '${trigger.record.fields.账号第一负责人}',
                账号当前昵称: '${trigger.record.fields.账号当前昵称}',
              },
            },
            next: 'end',
          },
          {
            id: 'end',
            type: 'condition',
            name: '结束',
            config: {
              logic: 'AND',
              expressions: [{ field: '账号当前昵称', operator: 'exists', source: 'after' }],
            },
          },
        ],
      },
    },
  },
  typeAwareConditionAndFilterOperators: {
    summary: '类型感知 condition 与 filter 操作符对照',
    value: {
      name: '条件与筛选操作符对照示例',
      scope: {
        type: 'table',
        appToken: 'app_token_demo',
        tableId: 'tbl_demo',
        eventTypes: ['record_updated'],
      },
      isActive: true,
      config: {
        id: 'wf_condition_filter_operator_demo_001',
        name: '条件与筛选操作符对照示例',
        trigger: {
          type: 'lark.bitable.record.changed',
          config: {
            app_token: 'app_token_demo',
            table_id: 'tbl_demo',
            actions: ['record_updated'],
          },
        },
        steps: [
          {
            id: 'condition_gate',
            type: 'condition',
            name: 'condition 操作符（类型感知）',
            config: {
              logic: 'AND',
              expressions: [
                { field: '粉丝数', operator: '>=', value: 1000, source: 'after' },
                { field: '第一负责人', operator: 'contains', value: { id: 'ou_xxx' }, source: 'after' },
                { field: '标签', operator: 'contains', value: '重点客户', source: 'after' },
                { field: '备注', operator: 'not_exists', source: 'after' },
              ],
            },
            onTrue: 'query_target',
            onFalse: 'end',
          },
          {
            id: 'query_target',
            type: 'action.bitable.query',
            name: 'filter 操作符（飞书筛选语义）',
            config: {
              app_token: 'app_token_demo',
              table_id: 'tbl_target',
              filter: {
                conjunction: 'and',
                conditions: [
                  { field_name: '标签', operator: 'contains', value: '重点客户' },
                  { field_name: '处理人', operator: 'isNotEmpty' },
                  { field_name: '创建时间', operator: 'isLess', value: '2026-01-01' },
                ],
              },
            },
            next: 'end',
          },
          {
            id: 'end',
            type: 'condition',
            config: {
              logic: 'AND',
              expressions: [{ field: '标题', operator: 'exists', source: 'after' }],
            },
          },
        ],
      },
    },
  },
  codecAwareBitableAction: {
    summary: 'codec 感知字段值示例（文本/人员自动转换）',
    value: {
      name: '字段类型自动转换示例',
      scope: {
        type: 'table',
        appToken: 'KaWjbBvGeaG0Fus5bwWcKLsJnfb',
        tableId: 'tbl6VxIEVkc1eY3S',
        eventTypes: ['record_updated'],
      },
      isActive: true,
      config: {
        id: 'wf_codec_demo_001',
        name: '字段类型自动转换示例',
        trigger: {
          type: 'lark.bitable.record.changed',
          config: {
            app_token: 'KaWjbBvGeaG0Fus5bwWcKLsJnfb',
            table_id: 'tbl6VxIEVkc1eY3S',
            actions: ['record_updated'],
          },
        },
        steps: [
          {
            id: 'create_b_record',
            type: 'action.bitable.create',
            config: {
              app_token: 'KaWjbBvGeaG0Fus5bwWcKLsJnfb',
              table_id: 'tblhV7wQW9uqdkMd',
              fields: {
                账号当前昵称: '${trigger.record.fields.账号当前昵称.0.text}',
                第一负责人: '${trigger.record.fields.账号第一负责人}',
              },
            },
          },
        ],
      },
    },
  },
}

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
  config: WorkflowConfigSchema.optional(),
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
    config: record.config || undefined,
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
  return error instanceof Error && error.message === WORKFLOW_SCOPE_TABLE_BINDING_REQUIRED
}

function isEventTypesInvalidError(error: unknown): boolean {
  return error instanceof Error && error.message === WORKFLOW_SCOPE_EVENT_TYPES_INVALID
}

function isEventTypesConflictError(error: unknown): boolean {
  return error instanceof Error && error.message === WORKFLOW_SCOPE_TRIGGER_EVENT_TYPES_CONFLICT
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
      description:
        '根据请求体中的名称、Workflow DSL（支持 DAG 分支）配置与 table 作用域创建新工作流。支持可选 eventTypes 过滤。' +
        'condition 使用工作流条件操作符（如 equals/contains/>=/changed），支持 condition.expressions[].source（before/after，默认 after），其中 changed 固定比较 before/after 两个快照。' +
        'action.bitable.query/delete.filter 使用飞书筛选操作符（如 is/isNot/isEmpty/isLess），与 condition 不是同一套命名。' +
        '字段类型元信息缺失时，condition 会回退文本处理器继续执行，并在执行输出中记录 type_fallbacks 诊断。' +
        'workflow DSL 还支持 step.when 守卫与 templatePolicy（fail/skip）。' +
        'workflow 运行时会按目标字段类型自动进行值转换：文本字段支持富文本模板转字符串，人员字段支持 open_id 或 [{id}] 结构。',
      request: {
        body: {
          content: {
            'application/json': {
              schema: CreateWorkflowSchema,
              examples: WorkflowCreateExamples,
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
        const normalized = normalizeScopeAndTriggerConfig(body.config, scope)

        const workflow = await workflowsDb.create(
          body.name,
          normalized.config,
          body.isActive,
          normalized.scope,
        )

        return ok(c, toWorkflowDetailResponse(workflow), '创建工作流成功', 201)
      } catch (error) {
        if (isTableScopeRequiredError(error)) {
          return err(c, 'WORKFLOW_SCOPE_TABLE_REQUIRED', '仅支持 table 作用域，必须提供 appToken 与 tableId', 400)
        }

        if (isEventTypesInvalidError(error)) {
          return err(c, 'WORKFLOW_EVENT_TYPES_INVALID', 'eventTypes 包含不支持的事件类型', 400)
        }

        if (isEventTypesConflictError(error)) {
          return err(c, 'WORKFLOW_EVENT_TYPES_CONFLICT', 'scope.eventTypes 与 trigger.config.action/actions 配置冲突', 400)
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
        '根据工作流 ID 更新名称、配置、作用域或启用状态。更新时会保证 scope、trigger.config 与 trigger_actions 一致。' +
        'condition 使用工作流条件操作符（如 equals/contains/>=/changed），支持 condition.expressions[].source（before/after，默认 after），其中 changed 固定比较 before/after 两个快照。' +
        'action.bitable.query/delete.filter 使用飞书筛选操作符（如 is/isNot/isEmpty/isLess），与 condition 不是同一套命名。' +
        '字段类型元信息缺失时，condition 会回退文本处理器继续执行，并在执行输出中记录 type_fallbacks 诊断。' +
        'workflow DSL 还支持 step.when 守卫与 templatePolicy（fail/skip）。' +
        'workflow 运行时会按目标字段类型自动进行值转换，并在错误时返回字段级诊断信息。',
      request: {
        params: WorkflowIdParamSchema,
        body: {
          content: {
            'application/json': {
              schema: UpdateWorkflowSchema,
              examples: WorkflowCreateExamples,
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
        const strictConflict = body.scope !== undefined && body.config !== undefined
        const normalized = normalizeScopeAndTriggerConfig(sourceConfig, effectiveScope, {
          strictConflict,
        })
        const scopeFields = toDbScopeFields(normalized.scope)

        const updates: {
          name?: string
          config: z.infer<typeof WorkflowConfigSchema>
          is_active?: boolean
          scope_type: 'table'
          app_token: string
          table_id: string
          trigger_actions: WorkflowEventType[] | null
        } = {
          config: normalized.config,
          scope_type: scopeFields.scope_type,
          app_token: scopeFields.app_token,
          table_id: scopeFields.table_id,
          trigger_actions: scopeFields.trigger_actions,
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

        if (isEventTypesInvalidError(error)) {
          return err(c, 'WORKFLOW_EVENT_TYPES_INVALID', 'eventTypes 包含不支持的事件类型', 400)
        }

        if (isEventTypesConflictError(error)) {
          return err(c, 'WORKFLOW_EVENT_TYPES_CONFLICT', 'scope.eventTypes 与 trigger.config.action/actions 配置冲突', 400)
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
