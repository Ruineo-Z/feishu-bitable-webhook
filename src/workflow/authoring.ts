import { PluginRegistry } from './core/registry'
import { WorkflowEngine } from './core/engine'
import {
  WORKFLOW_SCOPE_EVENT_TYPES_INVALID,
  WORKFLOW_SCOPE_TABLE_BINDING_REQUIRED,
  WORKFLOW_SCOPE_TRIGGER_EVENT_TYPES_CONFLICT,
  WorkflowScopeInput,
  normalizeScopeAndTriggerConfig,
} from './scope'
import { DryRunEffect, StepResult, WorkflowConfig } from './types'

export type WorkflowAuthoringOperation = 'create' | 'update'

export interface WorkflowValidationIssue {
  code: string
  path: string
  message: string
  hint?: string
  retryable: boolean
}

export interface WorkflowDryRunSummary {
  status: 'success' | 'failed'
  executionPath: string[]
  failedSteps: string[]
  effects: DryRunEffect[]
}

export interface WorkflowCandidateInput {
  operation: WorkflowAuthoringOperation
  workflowId?: string
  name: string
  config: WorkflowConfig
  scope: WorkflowScopeInput
  isActive?: boolean
  dryRun?: boolean
  triggerContext?: Record<string, unknown>
}

export interface NormalizedWorkflowCandidate {
  operation: WorkflowAuthoringOperation
  workflowId?: string
  name: string
  config: WorkflowConfig
  scope: WorkflowScopeInput
  isActive: boolean
}

export interface WorkflowCandidateValidationResult {
  valid: boolean
  issues: WorkflowValidationIssue[]
  normalized?: NormalizedWorkflowCandidate
  dryRun?: WorkflowDryRunSummary
}

function toIssue(
  code: string,
  path: string,
  message: string,
  hint?: string,
  retryable = true,
): WorkflowValidationIssue {
  return {
    code,
    path,
    message,
    hint,
    retryable,
  }
}

function toHintByCode(code: string): string {
  switch (code) {
    case 'UNRESOLVED_TEMPLATE':
      return '请补充模板变量所需字段，或将 templatePolicy 调整为 skip'
    case 'FIELD_MAPPING_MISSING':
      return '请确认字段已在目标表存在并完成 field_id 到字段名映射'
    case 'VALIDATION_ERROR':
      return '请补齐该步骤必填配置项'
    case 'FEISHU_API_ERROR':
      return '请检查动作参数是否符合飞书 API 约束（字段类型/过滤表达式）'
    case 'PLUGIN_NOT_REGISTERED':
      return '请使用已注册的节点类型，或先注册对应插件'
    default:
      return '请根据错误路径修正 DSL 后重试'
  }
}

function normalizeIssueFromScopeError(error: unknown): WorkflowValidationIssue {
  if (error instanceof Error && error.message === WORKFLOW_SCOPE_TABLE_BINDING_REQUIRED) {
    return toIssue(
      'WORKFLOW_SCOPE_TABLE_REQUIRED',
      '$.scope',
      '仅支持 table 作用域，必须提供 appToken 与 tableId',
      '请在 scope 中设置 type=table 并补齐 appToken/tableId',
      true,
    )
  }

  if (error instanceof Error && error.message === WORKFLOW_SCOPE_EVENT_TYPES_INVALID) {
    return toIssue(
      'WORKFLOW_EVENT_TYPES_INVALID',
      '$.scope.eventTypes',
      'eventTypes 包含不支持的事件类型',
      '仅支持 record_created / record_updated / record_deleted',
      true,
    )
  }

  if (error instanceof Error && error.message === WORKFLOW_SCOPE_TRIGGER_EVENT_TYPES_CONFLICT) {
    return toIssue(
      'WORKFLOW_EVENT_TYPES_CONFLICT',
      '$.config.trigger.config',
      'scope.eventTypes 与 trigger.config.action/actions 配置冲突',
      '建议仅保留 scope.eventTypes，由系统同步 trigger 配置',
      true,
    )
  }

  return toIssue(
    'WORKFLOW_VALIDATION_FAILED',
    '$',
    error instanceof Error ? error.message : '工作流校验失败',
    '请检查输入并重试',
    false,
  )
}

function buildDefaultTriggerContext(scope: WorkflowScopeInput): Record<string, unknown> {
  const eventType = scope.eventTypes?.[0] || 'record_updated'

  return {
    traceId: `workflow-validate-${Date.now()}`,
    app_token: scope.appToken,
    table_id: scope.tableId,
    record_id: 'dry_run_record',
    action_list: [{ action: eventType }],
    record: {
      fields: {},
      beforeFields: {},
    },
  }
}

function toStepPath(config: WorkflowConfig, stepId: string): string {
  const index = config.steps.findIndex((step) => step.id === stepId)
  if (index < 0) {
    return '$.config.steps'
  }

  return `$.config.steps[${index}]`
}

const IGNORABLE_DRY_RUN_ERROR_CODES = new Set(['CONDITION_NOT_MET'])

function collectStepIssues(
  config: WorkflowConfig,
  stepResults: Record<string, StepResult>,
): WorkflowValidationIssue[] {
  const issues: WorkflowValidationIssue[] = []

  for (const [stepId, result] of Object.entries(stepResults || {})) {
    if (result.success) {
      continue
    }

    const output = (result.output && typeof result.output === 'object')
      ? (result.output as Record<string, unknown>)
      : {}
    const code = typeof output.code === 'string' ? output.code : 'WORKFLOW_STEP_VALIDATION_FAILED'

    if (IGNORABLE_DRY_RUN_ERROR_CODES.has(code)) {
      continue
    }

    issues.push(
      toIssue(
        code,
        toStepPath(config, stepId),
        result.error || `步骤 ${stepId} 校验失败`,
        toHintByCode(code),
        true,
      ),
    )
  }

  return issues
}

function buildDryRunSummary(stepResults: Record<string, StepResult>, effects: DryRunEffect[]): WorkflowDryRunSummary {
  const executionPath = Object.keys(stepResults || {})
  const failedSteps = executionPath.filter((stepId) => {
    const result = stepResults[stepId]
    if (!result || result.success) {
      return false
    }

    const code = (result.output as any)?.code
    return !IGNORABLE_DRY_RUN_ERROR_CODES.has(code)
  })

  return {
    status: failedSteps.length > 0 ? 'failed' : 'success',
    executionPath,
    failedSteps,
    effects,
  }
}

export async function validateWorkflowCandidate(
  input: WorkflowCandidateInput,
): Promise<WorkflowCandidateValidationResult> {
  const issues: WorkflowValidationIssue[] = []

  if (input.operation === 'update' && !input.workflowId) {
    issues.push(
      toIssue(
        'WORKFLOW_ID_REQUIRED',
        '$.workflowId',
        '更新工作流时必须提供 workflowId',
        '请传入目标工作流 ID',
        true,
      ),
    )
  }

  if (issues.length > 0) {
    return {
      valid: false,
      issues,
    }
  }

  let normalizedScopeAndConfig: {
    scope: WorkflowScopeInput
    config: WorkflowConfig
  }

  try {
    normalizedScopeAndConfig = normalizeScopeAndTriggerConfig(input.config, input.scope, {
      strictConflict: true,
    })
  } catch (error) {
    return {
      valid: false,
      issues: [normalizeIssueFromScopeError(error)],
    }
  }

  const normalizedConfig: WorkflowConfig = {
    ...normalizedScopeAndConfig.config,
    name: input.name,
  }

  const normalized: NormalizedWorkflowCandidate = {
    operation: input.operation,
    workflowId: input.workflowId,
    name: input.name,
    config: normalizedConfig,
    scope: normalizedScopeAndConfig.scope,
    isActive: input.isActive ?? true,
  }

  const registry = PluginRegistry.getInstance()
  normalizedConfig.steps.forEach((step, index) => {
    if (!registry.get(step.type)) {
      issues.push(
        toIssue(
          'PLUGIN_NOT_REGISTERED',
          `$.config.steps[${index}].type`,
          `未找到插件类型: ${step.type}`,
          toHintByCode('PLUGIN_NOT_REGISTERED'),
          true,
        ),
      )
    }
  })

  let dryRunSummary: WorkflowDryRunSummary | undefined
  const shouldDryRun = input.dryRun !== false

  if (shouldDryRun && issues.length === 0) {
    try {
      const engine = new WorkflowEngine()
      const triggerContext = input.triggerContext || buildDefaultTriggerContext(normalized.scope)
      const workflowContext = await engine.execute(normalized.config, triggerContext, {
        mode: 'dry-run',
      })

      dryRunSummary = buildDryRunSummary(
        workflowContext.steps,
        workflowContext.runtime.dryRun.effects,
      )

      issues.push(...collectStepIssues(normalized.config, workflowContext.steps))
    } catch (error) {
      issues.push(
        toIssue(
          'WORKFLOW_DRY_RUN_FAILED',
          '$.config.steps',
          error instanceof Error ? error.message : 'dry-run 执行失败',
          '请检查步骤配置并重试',
          true,
        ),
      )
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    normalized,
    dryRun: dryRunSummary,
  }
}
