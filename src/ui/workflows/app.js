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

function validateAndBuildPayload() {
  const name = elements.workflowName.value.trim()
  if (!name) {
    throw new Error('请填写工作流名称。')
  }

  const configText = elements.workflowConfig.value.trim()
  if (!configText) {
    throw new Error('请填写工作流 DSL（JSON）。')
  }

  let config = null
  try {
    config = JSON.parse(configText)
  } catch {
    throw new Error('工作流 DSL JSON 格式不正确，请先修复语法错误。')
  }

  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('工作流 DSL 必须是 JSON 对象。')
  }

  const scopeType = elements.scopeType.value
  if (scopeType !== 'table') {
    throw new Error('当前仅支持 table 作用域。')
  }

  const appToken = elements.scopeAppToken.value.trim()
  const tableId = elements.scopeTableId.value.trim()

  if (!appToken || !tableId) {
    throw new Error('table 作用域必须填写 appToken 和 tableId。')
  }

  const scope = {
    type: 'table',
    appToken,
    tableId,
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
