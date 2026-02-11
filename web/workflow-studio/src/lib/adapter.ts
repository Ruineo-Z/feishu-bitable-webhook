import { parseEventTypesFromConfig, parseEventTypesFromText } from './event-types'
import type {
  AdapterError,
  ConditionFormModel,
  DecodeResult,
  EncodeResult,
  ExpressionFormModel,
  FormModel,
  WorkflowCondition,
  WorkflowConfig,
  WorkflowScope,
  WorkflowStep,
  WorkflowTemplatePolicy,
} from '../types/workflow'

function uid(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

export function createEmptyExpression(): ExpressionFormModel {
  return {
    id: uid('expr'),
    field: '',
    operator: 'equals',
    valueText: '',
    source: 'after',
  }
}

export function createEmptyCondition(): ConditionFormModel {
  return {
    logic: 'AND',
    expressions: [createEmptyExpression()],
  }
}

export function createDefaultStep(type: string = 'action.feishu.message'): FormModel['steps'][number] {
  if (type === 'condition') {
    return {
      id: uid('step_condition'),
      type: 'condition',
      name: '',
      configText: '{}',
      conditionConfig: createEmptyCondition(),
      whenEnabled: false,
      whenCondition: createEmptyCondition(),
      templatePolicy: '',
      next: '',
      onTrue: '',
      onFalse: '',
    }
  }

  return {
    id: uid('step_action'),
    type,
    name: '',
    configText: JSON.stringify(
      {
        receive_id: 'ou_xxx',
        receive_id_type: 'open_id',
        msg_type: 'text',
        content: '{"text":"请替换为你的通知内容"}',
      },
      null,
      2,
    ),
    conditionConfig: createEmptyCondition(),
    whenEnabled: false,
    whenCondition: createEmptyCondition(),
    templatePolicy: '',
    next: '',
    onTrue: '',
    onFalse: '',
  }
}

export function createDefaultFormModel(): FormModel {
  const conditionStep = createDefaultStep('condition')
  conditionStep.name = '负责人变化且昵称非空'
  conditionStep.conditionConfig = {
    logic: 'AND',
    expressions: [
      {
        id: uid('expr'),
        field: '账号第一负责人',
        operator: 'changed',
        valueText: '',
        source: 'after',
      },
      {
        id: uid('expr'),
        field: '账号名称',
        operator: 'exists',
        valueText: '',
        source: 'after',
      },
    ],
  }
  conditionStep.onTrue = 'step_action_notify'

  const actionStep = createDefaultStep('action.feishu.message')
  actionStep.id = 'step_action_notify'
  actionStep.name = '发送通知'
  actionStep.templatePolicy = 'fail'

  return {
    name: '',
    isActive: true,
    scopeType: 'table',
    appToken: '',
    tableId: '',
    eventTypesText: 'record_updated',
    configId: uid('wf'),
    steps: [conditionStep, actionStep],
  }
}

function trimNullable(value: string): string | undefined {
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function parseExpressionValue(raw: string): unknown {
  const trimmed = raw.trim()
  if (!trimmed) return undefined

  if (/^(true|false|null)$/i.test(trimmed)) {
    return JSON.parse(trimmed.toLowerCase())
  }

  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed)
  }

  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      return JSON.parse(trimmed)
    } catch {
      return trimmed
    }
  }

  return trimmed
}

function toCondition(condition: ConditionFormModel, path: string): WorkflowCondition {
  const expressions = condition.expressions
    .map((expression, index) => {
      const field = expression.field.trim()
      const operator = expression.operator.trim()
      if (!field || !operator) {
        throw createModelError(`${path}.expressions[${index}] 需要填写 field 和 operator`)
      }

      const parsedValue = parseExpressionValue(expression.valueText)
      return {
        field,
        operator,
        source: expression.source,
        ...(parsedValue !== undefined ? { value: parsedValue } : {}),
      }
    })

  if (!expressions.length) {
    throw createModelError(`${path}.expressions 至少保留一个表达式`)
  }

  return {
    logic: condition.logic,
    expressions,
  }
}

function parseJsonObject(rawText: string, path: string): Record<string, unknown> {
  const trimmed = rawText.trim()
  if (!trimmed) {
    return {}
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    throw createModelError(`${path} 不是合法 JSON`) 
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw createModelError(`${path} 必须是 JSON 对象`)
  }

  return parsed as Record<string, unknown>
}

function normalizeStepPolicy(value: '' | WorkflowTemplatePolicy): WorkflowTemplatePolicy | undefined {
  if (value === 'fail' || value === 'skip') {
    return value
  }
  return undefined
}

function toWorkflowStep(step: FormModel['steps'][number], stepIds: Set<string>): WorkflowStep {
  const id = step.id.trim()
  const type = step.type.trim()

  if (!id) {
    throw createModelError('步骤 id 不能为空')
  }
  if (!type) {
    throw createModelError(`步骤 ${id} 的类型不能为空`)
  }
  if (stepIds.has(id)) {
    throw createModelError(`步骤 id 重复：${id}`)
  }
  stepIds.add(id)

  const base: WorkflowStep = {
    id,
    type,
    config: {},
  }

  const name = trimNullable(step.name)
  if (name) base.name = name

  if (type === 'condition') {
    base.config = toCondition(step.conditionConfig, `步骤 ${id}.config`) as unknown as Record<string, unknown>
  } else {
    base.config = parseJsonObject(step.configText, `步骤 ${id}.config`)
  }

  const whenEnabled = step.whenEnabled
  if (whenEnabled) {
    base.when = toCondition(step.whenCondition, `步骤 ${id}.when`)
  }

  const templatePolicy = normalizeStepPolicy(step.templatePolicy)
  if (templatePolicy) {
    base.templatePolicy = templatePolicy
  }

  const next = trimNullable(step.next)
  const onTrue = trimNullable(step.onTrue)
  const onFalse = trimNullable(step.onFalse)

  if (next) base.next = next
  if (onTrue) base.onTrue = onTrue
  if (onFalse) base.onFalse = onFalse

  return base
}

function buildScope(model: FormModel): WorkflowScope {
  const appToken = model.appToken.trim()
  const tableId = model.tableId.trim()
  if (!appToken || !tableId) {
    throw createModelError('table 作用域必须填写 appToken 与 tableId')
  }

  const { eventTypes, invalidValues } = parseEventTypesFromText(model.eventTypesText)
  if (invalidValues.length > 0) {
    throw createModelError(`eventTypes 存在不支持的值：${Array.from(new Set(invalidValues)).join(', ')}`)
  }

  return {
    type: 'table',
    appToken,
    tableId,
    ...(eventTypes.length > 0 ? { eventTypes } : {}),
  }
}

function buildTrigger(scope: WorkflowScope): WorkflowConfig['trigger'] {
  return {
    type: 'lark.bitable.record.changed',
    config: {
      app_token: scope.appToken,
      table_id: scope.tableId,
      ...(scope.eventTypes && scope.eventTypes.length > 0 ? { actions: scope.eventTypes } : {}),
    },
  }
}

function createModelError(message: string): AdapterError {
  return {
    code: 'MODEL_INVALID',
    message,
  }
}

export function encodeFormModel(model: FormModel): EncodeResult {
  const name = model.name.trim()
  if (!name) {
    throw createModelError('工作流名称不能为空')
  }

  if (!Array.isArray(model.steps) || model.steps.length === 0) {
    throw createModelError('至少保留一个步骤')
  }

  const scope = buildScope(model)
  const stepIds = new Set<string>()
  const steps = model.steps.map((step) => toWorkflowStep(step, stepIds))

  const configId = model.configId.trim() || uid('wf')

  return {
    scope,
    config: {
      id: configId,
      name,
      trigger: buildTrigger(scope),
      steps,
    },
  }
}

function stringifyUnknown(value: unknown): string {
  if (value === undefined) return ''
  if (value === null) return 'null'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)

  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function fromCondition(condition: unknown): ConditionFormModel {
  const fallback = createEmptyCondition()
  if (!condition || typeof condition !== 'object' || Array.isArray(condition)) {
    return fallback
  }

  const logic = (condition as WorkflowCondition).logic === 'OR' ? 'OR' : 'AND'
  const expressions = Array.isArray((condition as WorkflowCondition).expressions)
    ? (condition as WorkflowCondition).expressions
    : []

  if (expressions.length === 0) {
    return {
      logic,
      expressions: [createEmptyExpression()],
    }
  }

  return {
    logic,
    expressions: expressions.map((expression) => ({
      id: uid('expr'),
      field: String(expression?.field ?? ''),
      operator: String(expression?.operator ?? ''),
      valueText: stringifyUnknown(expression?.value),
      source: expression?.source === 'before' ? 'before' : 'after',
    })),
  }
}

function extractScopeFromTrigger(config: WorkflowConfig): WorkflowScope | null {
  const triggerConfig = config.trigger?.config
  if (!triggerConfig || typeof triggerConfig !== 'object') {
    return null
  }

  const appToken = String((triggerConfig as Record<string, unknown>).app_token ?? '').trim()
  const tableId = String((triggerConfig as Record<string, unknown>).table_id ?? '').trim()

  if (!appToken || !tableId) {
    return null
  }

  const eventTypes = parseEventTypesFromConfig(triggerConfig as Record<string, unknown>)

  return {
    type: 'table',
    appToken,
    tableId,
    ...(eventTypes.length > 0 ? { eventTypes } : {}),
  }
}

export function resolveScopeFromConfig(config: WorkflowConfig, fallback: Pick<FormModel, 'appToken' | 'tableId' | 'eventTypesText'>): WorkflowScope {
  const extracted = extractScopeFromTrigger(config)
  if (extracted) {
    return extracted
  }

  const appToken = fallback.appToken.trim()
  const tableId = fallback.tableId.trim()
  if (!appToken || !tableId) {
    throw {
      code: 'DSL_SCOPE_MISSING',
      message: '高级模式 JSON 未包含 trigger.config.app_token/table_id，且表单作用域为空。',
    } as AdapterError
  }

  const { eventTypes } = parseEventTypesFromText(fallback.eventTypesText)
  return {
    type: 'table',
    appToken,
    tableId,
    ...(eventTypes.length > 0 ? { eventTypes } : {}),
  }
}

function makeUnsupported(message: string, model?: FormModel): DecodeResult {
  return {
    supported: false,
    model: model ?? createDefaultFormModel(),
    warning: {
      code: 'DSL_UNSUPPORTED',
      message,
    },
  }
}

export function decodeConfigToFormModel(config: WorkflowConfig, isActive = true): DecodeResult {
  if (!config || typeof config !== 'object') {
    return makeUnsupported('DSL 为空或结构不合法。')
  }

  if (!Array.isArray(config.steps) || config.steps.length === 0) {
    return makeUnsupported('DSL.steps 为空，无法映射到可视化模式。')
  }

  const scope = extractScopeFromTrigger(config)
  if (!scope) {
    return makeUnsupported('DSL 缺少 trigger.config.app_token/table_id，无法进入可视化模式。')
  }

  const steps: FormModel['steps'] = []

  for (const step of config.steps) {
    if (!step || typeof step !== 'object' || Array.isArray(step)) {
      return makeUnsupported('存在非法步骤结构，已切换到高级模式。')
    }

    if (!step.id || !step.type) {
      return makeUnsupported('存在缺少 id/type 的步骤，已切换到高级模式。')
    }

    if (!step.config || typeof step.config !== 'object' || Array.isArray(step.config)) {
      return makeUnsupported(`步骤 ${step.id} 的 config 不是对象，无法可视化。`)
    }

    const normalizedStep: FormModel['steps'][number] = {
      id: step.id,
      type: step.type,
      name: step.name || '',
      configText: JSON.stringify(step.config, null, 2),
      conditionConfig: createEmptyCondition(),
      whenEnabled: false,
      whenCondition: createEmptyCondition(),
      templatePolicy: step.templatePolicy === 'fail' || step.templatePolicy === 'skip' ? step.templatePolicy : '',
      next: step.next || '',
      onTrue: step.onTrue || '',
      onFalse: step.onFalse || '',
    }

    if (step.type === 'condition') {
      normalizedStep.conditionConfig = fromCondition(step.config)
      normalizedStep.configText = JSON.stringify(step.config, null, 2)
    }

    if (step.when) {
      normalizedStep.whenEnabled = true
      normalizedStep.whenCondition = fromCondition(step.when)
    }

    steps.push(normalizedStep)
  }

  const eventTypesText = scope.eventTypes?.join(', ') || ''

  return {
    supported: true,
    model: {
      name: config.name,
      isActive,
      scopeType: 'table',
      appToken: scope.appToken,
      tableId: scope.tableId,
      eventTypesText,
      configId: config.id || uid('wf'),
      steps,
    },
  }
}

export function serializeConfig(config: WorkflowConfig): string {
  return JSON.stringify(config, null, 2)
}

export function parseConfigJson(text: string): WorkflowConfig {
  const trimmed = text.trim()
  if (!trimmed) {
    throw {
      code: 'DSL_INVALID',
      message: '高级模式 JSON 不能为空。',
    } as AdapterError
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    throw {
      code: 'DSL_INVALID',
      message: '高级模式 JSON 语法错误，请先修复。',
    } as AdapterError
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw {
      code: 'DSL_INVALID',
      message: '高级模式 JSON 必须是对象。',
    } as AdapterError
  }

  const workflowConfig = parsed as WorkflowConfig
  if (!workflowConfig.id || !workflowConfig.name || !workflowConfig.trigger || !Array.isArray(workflowConfig.steps)) {
    throw {
      code: 'DSL_INVALID',
      message: '高级模式 JSON 缺少必填字段（id/name/trigger/steps）。',
    } as AdapterError
  }

  return workflowConfig
}
