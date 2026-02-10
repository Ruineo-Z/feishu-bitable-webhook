function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function formatDateTime(value) {
  if (!value) return '-'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function formatScope(scope) {
  if (!scope || typeof scope !== 'object') {
    return '未知'
  }

  const appToken = scope.appToken || '-'
  const tableId = scope.tableId || '-'
  const eventTypes = Array.isArray(scope.eventTypes) ? scope.eventTypes : []
  const eventSummary = eventTypes.length > 0 ? eventTypes.join('/') : 'all-events'

  return `table · ${appToken}/${tableId} · ${eventSummary}`
}

export function renderFeedback(elements, feedback) {
  const node = elements.feedback

  if (!feedback || !feedback.message) {
    node.className = 'feedback'
    node.textContent = ''
    return
  }

  node.className = `feedback ${feedback.type || 'info'}`
  node.textContent = feedback.message
}

export function renderScopeBindingVisibility(elements) {
  const isTable = elements.scopeType.value === 'table'
  elements.scopeBindingFields.hidden = !isTable
}

export function renderFormMode(elements, state) {
  const isEdit = state.editor.mode === 'edit'
  elements.formTitle.textContent = isEdit ? `编辑工作流（${state.editor.workflowId}）` : '新建工作流'
  elements.submitBtn.textContent = isEdit ? '保存更新' : '创建工作流'
}

export function fillFormFromWorkflow(elements, workflow) {
  elements.workflowName.value = workflow.name || ''
  elements.workflowActive.checked = Boolean(workflow.is_active)
  elements.scopeType.value = 'table'
  elements.scopeAppToken.value = workflow.scope?.appToken || ''
  elements.scopeTableId.value = workflow.scope?.tableId || ''
  elements.scopeEventTypes.value = Array.isArray(workflow.scope?.eventTypes)
    ? workflow.scope.eventTypes.join(', ')
    : ''

  elements.workflowConfig.value = JSON.stringify(workflow.config || {}, null, 2)
  renderScopeBindingVisibility(elements)
}

export function resetFormValues(elements, defaultConfigText) {
  elements.workflowName.value = ''
  elements.workflowActive.checked = true
  elements.scopeType.value = 'table'
  elements.scopeAppToken.value = ''
  elements.scopeTableId.value = ''
  elements.scopeEventTypes.value = ''
  elements.workflowConfig.value = defaultConfigText
  renderScopeBindingVisibility(elements)
}

export function renderWorkflowList(elements, state) {
  const tbody = elements.workflowTableBody
  const listState = elements.listState

  if (state.loading) {
    tbody.innerHTML = ''
    listState.textContent = '正在加载工作流列表...'
    return
  }

  if (state.error) {
    tbody.innerHTML = ''
    listState.textContent = state.error
    return
  }

  if (!state.workflows.length) {
    tbody.innerHTML = ''
    listState.textContent = '当前没有工作流数据，可以先在右侧创建一个。'
    return
  }

  listState.textContent = ''

  tbody.innerHTML = state.workflows
    .map((workflow) => {
      const statusClass = workflow.is_active ? 'active' : 'inactive'
      const statusText = workflow.is_active ? '启用' : '禁用'
      return `
        <tr>
          <td>${escapeHtml(workflow.name || '-') }</td>
          <td><span class="badge ${statusClass}">${statusText}</span></td>
          <td><span class="badge scope">${escapeHtml(formatScope(workflow.scope))}</span></td>
          <td>${escapeHtml(formatDateTime(workflow.updated_at))}</td>
          <td>
            <div class="row-actions">
              <button class="btn btn-ghost" data-action="edit" data-id="${escapeHtml(workflow.id)}" type="button">编辑</button>
              <button class="btn btn-danger" data-action="delete" data-id="${escapeHtml(workflow.id)}" data-name="${escapeHtml(workflow.name || '')}" type="button">删除</button>
            </div>
          </td>
        </tr>
      `
    })
    .join('')
}

export function renderPagination(elements, state) {
  const { limit, offset, total } = state.pagination
  const currentPage = Math.floor(offset / limit) + 1
  const totalPages = Math.max(1, Math.ceil(total / limit))

  elements.pageInfo.textContent = `第 ${currentPage} 页 / 共 ${totalPages} 页（共 ${total} 条）`
  elements.prevPageBtn.disabled = state.loading || offset <= 0
  elements.nextPageBtn.disabled = state.loading || offset + limit >= total
}
