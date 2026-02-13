import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { workflowsDb } from '../db/workflows'
import { WorkflowConfigSchema } from '../workflow/dsl/schema'
import {
  WORKFLOW_EVENT_TYPES,
  WorkflowScopeInput,
} from '../workflow/scope'
import { ok, err } from '../http/response'
import {
  validateWorkflowCandidate,
  WorkflowAuthoringOperation,
  WorkflowDryRunSummary,
  WorkflowValidationIssue,
} from '../workflow/authoring'

const WorkflowEventTypeSchema = z.enum(WORKFLOW_EVENT_TYPES)

const WorkflowScopeSchema = z
  .object({
    type: z.literal('table').describe('表级作用域（仅支持 table）'),
    appToken: z.string().min(1).describe('绑定 app_token'),
    tableId: z.string().min(1).describe('绑定 table_id'),
    eventTypes: z
      .array(WorkflowEventTypeSchema)
      .optional()
      .describe('可选事件过滤，未配置表示匹配该表全部记录事件'),
  })
  .describe('工作流作用域配置（仅支持 table 作用域）')

const WorkflowOperationSchema = z.enum(['create', 'update'])

const WorkflowDryRunRequestSchema = z.object({
  operation: WorkflowOperationSchema.describe('编排操作类型：create 或 update'),
  workflowId: z.string().optional().describe('更新时传入目标 workflow ID'),
  name: z.string().min(1).describe('工作流名称'),
  config: WorkflowConfigSchema.describe('候选 Workflow DSL 配置'),
  scope: WorkflowScopeSchema.describe('候选作用域配置'),
  isActive: z.boolean().optional().default(true).describe('是否启用，默认 true'),
  dryRun: z.boolean().optional().default(true).describe('是否执行 dry-run，默认 true'),
  triggerContext: z.record(z.unknown()).optional().describe('可选 dry-run 触发上下文样本'),
})

const WorkflowValidationIssueSchema = z.object({
  code: z.string(),
  path: z.string(),
  message: z.string(),
  hint: z.string().optional(),
  retryable: z.boolean(),
})

const DryRunEffectSchema = z.object({
  stepId: z.string(),
  stepType: z.string(),
  action: z.string(),
  target: z.record(z.unknown()).optional(),
  payload: z.unknown().optional(),
})

const DryRunSummarySchema = z.object({
  status: z.enum(['success', 'failed']),
  executionPath: z.array(z.string()),
  failedSteps: z.array(z.string()),
  effects: z.array(DryRunEffectSchema),
})

const WorkflowDryRunNormalizedSchema = z.object({
  operation: WorkflowOperationSchema,
  workflowId: z.string().optional(),
  name: z.string(),
  config: WorkflowConfigSchema,
  scope: WorkflowScopeSchema,
  isActive: z.boolean(),
})

const WorkflowDryRunDataSchema = z.object({
  valid: z.boolean(),
  operation: WorkflowOperationSchema,
  workflowId: z.string().optional(),
  errors: z.array(WorkflowValidationIssueSchema),
  dryRun: DryRunSummarySchema.optional(),
  normalized: WorkflowDryRunNormalizedSchema.optional(),
})

const WorkflowDryRunSuccessSchema = z.object({
  code: z.literal('OK'),
  message: z.string(),
  data: WorkflowDryRunDataSchema,
})

const ErrorEnvelopeSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
})

function normalizeDryRunResponse(
  operation: WorkflowAuthoringOperation,
  workflowId: string | undefined,
  issues: WorkflowValidationIssue[],
  dryRun: WorkflowDryRunSummary | undefined,
  normalized?: {
    operation: WorkflowAuthoringOperation
    workflowId?: string
    name: string
    config: z.infer<typeof WorkflowConfigSchema>
    scope: WorkflowScopeInput
    isActive: boolean
  },
) {
  return {
    valid: issues.length === 0,
    operation,
    workflowId,
    errors: issues,
    dryRun,
    normalized: normalized
      ? {
          operation: normalized.operation,
          workflowId: normalized.workflowId,
          name: normalized.name,
          config: normalized.config,
          scope: normalized.scope,
          isActive: normalized.isActive,
        }
      : undefined,
  }
}

export default function registerWorkflowAuthoringRoutes(app: OpenAPIHono) {
  app.openapi(
    createRoute({
      method: 'post',
      path: '/api/workflows/dry-run',
      tags: ['Workflows'],
      summary: 'dry-run 校验工作流候选 DSL',
      description:
        '用于 Agent/Skill 编排闭环：执行 scope/trigger 一致性校验、插件可用性检查与 dry-run 模拟执行。' +
        '该接口不发布 workflow，仅返回结构化错误和执行预览。',
      request: {
        body: {
          content: {
            'application/json': {
              schema: WorkflowDryRunRequestSchema,
            },
          },
        },
      },
      responses: {
        200: {
          description: 'dry-run 校验完成（通过或失败）',
          content: {
            'application/json': {
              schema: WorkflowDryRunSuccessSchema,
            },
          },
        },
        404: {
          description: '更新目标不存在',
          content: {
            'application/json': {
              schema: ErrorEnvelopeSchema,
            },
          },
        },
        500: {
          description: 'dry-run 校验流程异常',
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

        if (body.operation === 'update') {
          if (!body.workflowId) {
            return err(c, 'WORKFLOW_ID_REQUIRED', '更新工作流时必须提供 workflowId', 400)
          }

          const existing = await workflowsDb.findById(body.workflowId)
          if (!existing) {
            return err(c, 'WORKFLOW_NOT_FOUND', '工作流不存在', 404)
          }
        }

        const validation = await validateWorkflowCandidate({
          operation: body.operation,
          workflowId: body.workflowId,
          name: body.name,
          config: body.config,
          scope: body.scope as WorkflowScopeInput,
          isActive: body.isActive,
          dryRun: body.dryRun,
          triggerContext: body.triggerContext,
        })

        return ok(
          c,
          normalizeDryRunResponse(
            body.operation,
            body.workflowId,
            validation.issues,
            validation.dryRun,
            validation.normalized,
          ),
          validation.valid ? '工作流 dry-run 校验通过' : '工作流 dry-run 校验失败',
        )
      } catch (error) {
        return err(c, 'WORKFLOW_DRY_RUN_FAILED', '工作流 dry-run 校验失败', 500, error)
      }
    }) as any,
  )
}
