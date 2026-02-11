import {
  createWorkflow,
  deleteWorkflow,
  fetchWorkflowDetail,
  fetchWorkflowList,
  toUserFacingError,
  updateWorkflow,
} from './api.js'
import {
  createDefaultConfigTemplate,
  createInitialState,
  resetEditorState,
  setEditorWorkflow,
  setPagination,
} from './state.js'
import {
  fillFormFromWorkflow,
  renderFeedback,
  renderFormMode,
  renderPagination,
  renderScopeBindingVisibility,
  renderWorkflowList,
  resetFormValues,
} from './view.js'

const UI_EVENT_TYPE_ALIASES = {
  record_created: 'record_created',
  record_added: 'record_created',
  add: 'record_created',
  record_updated: 'record_updated',
  record_edited: 'record_updated',
  update: 'record_updated',
  record_deleted: 'record_deleted',
  remove: 'record_deleted',
  delete: 'record_deleted',
}

const CONDITION_SOURCES = new Set(['before', 'after'])
const TEMPLATE_POLICIES = new Set(['fail', 'skip'])

const state = createInitialState()
const defaultConfigText = createDefaultConfigTemplate()

const elements = {
  workflowTableBody: document.getElementById('workflow-table-body'),
  listState: document.getElementById('list-state'),
  pageInfo: document.getElementById('page-info'),
  prevPageBtn: document.getElementById('prev-page-btn'),
  nextPageBtn: document.getElementById('next-page-btn'),
  statusFilter: document.getElementById('status-filter'),
  limitSelect: document.getElementById('limit-select'),
  refreshBtn: document.getElementById('refresh-btn'),
  feedback: document.getElementById('feedback'),
  formTitle: document.getElementById('form-title'),
  workflowForm: document.getElementById('workflow-form'),
  workflowName: document.getElementById('workflow-name'),
  workflowActive: document.getElementById('workflow-active'),
  scopeType: document.getElementById('scope-type'),
  scopeBindingFields: document.getElementById('scope-binding-fields'),
  scopeAppToken: document.getElementById('scope-app-token'),
  scopeTableId: document.getElementById('scope-table-id'),
  scopeEventTypes: document.getElementById('scope-event-types'),
  workflowConfig: document.getElementById('workflow-config'),
  submitBtn: document.getElementById('submit-btn'),
  resetFormBtn: document.getElementById('reset-form-btn'),
  createNewBtn: document.getElementById('create-new-btn'),
}

function syncView() {
  renderFeedback(elements, state.feedback)
  renderWorkflowList(elements, state)
  renderPagination(elements, state)
  renderFormMode(elements, state)
  renderScopeBindingVisibility(elements)
}

function setFeedback(type, message) {
  state.feedback = {
    type,
    message,
  }
  renderFeedback(elements, state.feedback)
}

function resetFormForCreateMode() {
  resetEditorState(state)
  resetFormValues(elements, defaultConfigText)
  renderFormMode(elements, state)
}

function normalizeEventType(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return null
  return UI_EVENT_TYPE_ALIASES[normalized] || null
}

function parseEventTypesInput(rawInput) {
  const text = String(rawInput || '').trim()
  if (!text) {
    return []
  }

  const rawTokens = text
    .split(/[\n,，]/)
    .map((token) => token.trim())
    .filter(Boolean)

  const normalized = []
  const invalid = []

  for (const token of rawTokens) {
    const normalizedEventType = normalizeEventType(token)
    if (normalizedEventType) {
      normalized.push(normalizedEventType)
      continue
    }
    invalid.push(token)
  }

  if (invalid.length > 0) {
    throw new Error(`eventTypes 存在不支持的值：${Array.from(new Set(invalid)).join(', ')}`)
  }

  return Array.from(new Set(normalized))
}

function ensureConditionObject(condition, path) {
  if (!condition || typeof condition !== 'object' || Array.isArray(condition)) {
    throw new Error(`${path} 必须是条件对象（包含 logic 与 expressions）。`)
  }

  const logic = condition.logic
  if (logic !== 'AND' && logic !== 'OR') {
    throw new Error(`${path}.logic 仅支持 AND 或 OR。`)
  }

  if (!Array.isArray(condition.expressions) || condition.expressions.length === 0) {
    throw new Error(`${path}.expressions 至少包含一个表达式。`)
  }

  condition.expressions.forEach((expression, index) => {
    const expressionPath = `${path}.expressions[${index}]`
    if (!expression || typeof expression !== 'object' || Array.isArray(expression)) {
      throw new Error(`${expressionPath} 必须是对象。`)
    }

    if (!expression.field || typeof expression.field !== 'string') {
      throw new Error(`${expressionPath}.field 必填且必须为字符串。`)
    }

    if (!expression.operator || typeof expression.operator !== 'string') {
      throw new Error(`${expressionPath}.operator 必填且必须为字符串。`)
    }

    if (expression.source !== undefined && !CONDITION_SOURCES.has(expression.source)) {
      throw new Error(`${expressionPath}.source 仅支持 before 或 after。`)
    }
  })
}

function validateWorkflowDsl(config) {
  if (!Array.isArray(config.steps) || config.steps.length === 0) {
    throw new Error('Workflow DSL.steps 至少包含一个步骤。')
  }

  config.steps.forEach((step, index) => {
    const stepPath = `steps[${index}]`
    if (!step || typeof step !== 'object' || Array.isArray(step)) {
      throw new Error(`${stepPath} 必须是对象。`)
    }

    if (!step.id || typeof step.id !== 'string') {
      throw new Error(`${stepPath}.id 必填且必须为字符串。`)
    }

    if (!step.type || typeof step.type !== 'string') {
      throw new Error(`${stepPath}.type 必填且必须为字符串。`)
    }

    if (!step.config || typeof step.config !== 'object' || Array.isArray(step.config)) {
      throw new Error(`${stepPath}.config 必须是对象。`)
    }

    if (step.type === 'condition') {
      ensureConditionObject(step.config, `${stepPath}.config`)
    }

    if (step.when !== undefined) {
      ensureConditionObject(step.when, `${stepPath}.when`)
    }

    if (step.templatePolicy !== undefined && !TEMPLATE_POLICIES.has(step.templatePolicy)) {
      throw new Error(`${stepPath}.templatePolicy 仅支持 fail 或 skip。`)
    }
  })
}

function validateAndBuildPayload() {
  const name = elements.workflowName.value.trim()
  if (!name) {
    throw new Error('请填写工作流名称。')
  }

  const configText = elements.workflowConfig.value.trim()
  if (!configText) {
    throw new Error('请填写 Workflow DSL（支持 DAG 分支，JSON）。')
  }

  let config = null
  try {
    config = JSON.parse(configText)
  } catch {
    throw new Error('Workflow DSL JSON 格式不正确，请先修复语法错误。')
  }

  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('Workflow DSL 必须是 JSON 对象。')
  }
  validateWorkflowDsl(config)

  const scopeType = elements.scopeType.value
  if (scopeType !== 'table') {
    throw new Error('当前仅支持 table 作用域。')
  }

  const appToken = elements.scopeAppToken.value.trim()
  const tableId = elements.scopeTableId.value.trim()

  if (!appToken || !tableId) {
    throw new Error('table 作用域必须填写 appToken 和 tableId。')
  }

  const eventTypes = parseEventTypesInput(elements.scopeEventTypes.value)

  const scope = {
    type: 'table',
    appToken,
    tableId,
  }

  if (eventTypes.length > 0) {
    scope.eventTypes = eventTypes
  }

  return {
    name,
    config,
    scope,
    isActive: elements.workflowActive.checked,
  }
}

async function loadWorkflowList() {
  state.loading = true
  state.error = ''
  syncView()

  try {
    const response = await fetchWorkflowList({
      limit: state.pagination.limit,
      offset: state.pagination.offset,
      isActive: state.filter.isActive,
    })

    state.workflows = Array.isArray(response.data) ? response.data : []
    setPagination(state, {
      total: response.meta?.pagination?.total ?? state.workflows.length,
      limit: response.meta?.pagination?.limit ?? state.pagination.limit,
      offset: response.meta?.pagination?.offset ?? state.pagination.offset,
    })
  } catch (error) {
    const userError = toUserFacingError(error)
    state.workflows = []
    state.error = `${userError.message}（${userError.code}）`
  } finally {
    state.loading = false
    syncView()
  }
}

async function openEditor(workflowId) {
  try {
    setFeedback('info', '正在加载工作流详情...')
    const response = await fetchWorkflowDetail(workflowId)
    setEditorWorkflow(state, workflowId)
    fillFormFromWorkflow(elements, response.data)
    renderFormMode(elements, state)
    setFeedback('success', response.message || '工作流详情加载成功。')
  } catch (error) {
    const userError = toUserFacingError(error)
    setFeedback('error', `${userError.message}（${userError.code}）`)
  }
}

async function handleDelete(workflowId, workflowName) {
  const confirmed = window.confirm(`确认删除工作流「${workflowName || workflowId}」吗？此操作不可恢复。`)
  if (!confirmed) {
    setFeedback('info', '已取消删除操作。')
    return
  }

  try {
    const response = await deleteWorkflow(workflowId)
    setFeedback('success', response.message || '工作流删除成功。')

    if (state.editor.workflowId === workflowId) {
      resetFormForCreateMode()
    }

    if (state.pagination.offset >= state.pagination.total - 1 && state.pagination.offset > 0) {
      state.pagination.offset = Math.max(0, state.pagination.offset - state.pagination.limit)
    }

    await loadWorkflowList()
  } catch (error) {
    const userError = toUserFacingError(error)
    setFeedback('error', `${userError.message}（${userError.code}）`)
  }
}

async function handleSubmit(event) {
  event.preventDefault()

  let payload = null
  try {
    payload = validateAndBuildPayload()
  } catch (error) {
    setFeedback('error', error.message)
    return
  }

  try {
    const currentWorkflowId = state.editor.workflowId

    if (currentWorkflowId) {
      const response = await updateWorkflow(currentWorkflowId, payload)
      setFeedback('success', response.message || '工作流更新成功。')
      await loadWorkflowList()
      await openEditor(currentWorkflowId)
      return
    }

    const response = await createWorkflow(payload)
    setFeedback('success', response.message || '工作流创建成功。')
    resetFormForCreateMode()
    state.pagination.offset = 0
    await loadWorkflowList()
  } catch (error) {
    const userError = toUserFacingError(error)
    setFeedback('error', `${userError.message}（${userError.code}）`)
  }
}

function handleTableAction(event) {
  const target = event.target.closest('button[data-action]')
  if (!target) return

  const action = target.dataset.action
  const workflowId = target.dataset.id
  const workflowName = target.dataset.name

  if (!workflowId) return

  if (action === 'edit') {
    void openEditor(workflowId)
    return
  }

  if (action === 'delete') {
    void handleDelete(workflowId, workflowName)
  }
}

function bindEvents() {
  elements.refreshBtn.addEventListener('click', () => {
    void loadWorkflowList()
  })

  elements.workflowForm.addEventListener('submit', handleSubmit)
  elements.workflowTableBody.addEventListener('click', handleTableAction)

  elements.scopeType.addEventListener('change', () => {
    renderScopeBindingVisibility(elements)
  })

  elements.resetFormBtn.addEventListener('click', () => {
    resetFormForCreateMode()
    setFeedback('info', '表单已重置。')
  })

  elements.createNewBtn.addEventListener('click', () => {
    resetFormForCreateMode()
    setFeedback('info', '已切换到新建模式。')
  })

  elements.statusFilter.addEventListener('change', () => {
    state.filter.isActive = elements.statusFilter.value
    state.pagination.offset = 0
    void loadWorkflowList()
  })

  elements.limitSelect.addEventListener('change', () => {
    const nextLimit = Number(elements.limitSelect.value)
    state.pagination.limit = Number.isFinite(nextLimit) ? nextLimit : 10
    state.pagination.offset = 0
    void loadWorkflowList()
  })

  elements.prevPageBtn.addEventListener('click', () => {
    if (state.pagination.offset <= 0) return
    state.pagination.offset = Math.max(0, state.pagination.offset - state.pagination.limit)
    void loadWorkflowList()
  })

  elements.nextPageBtn.addEventListener('click', () => {
    if (state.pagination.offset + state.pagination.limit >= state.pagination.total) return
    state.pagination.offset += state.pagination.limit
    void loadWorkflowList()
  })
}

function bootstrap() {
  elements.limitSelect.value = String(state.pagination.limit)
  elements.statusFilter.value = state.filter.isActive
  resetFormForCreateMode()
  bindEvents()
  syncView()
  void loadWorkflowList()
}

bootstrap()
