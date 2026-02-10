const WORKFLOW_API_BASE = '/api/workflows'

const FRIENDLY_ERROR_MESSAGES = {
  WORKFLOW_NOT_FOUND: '工作流不存在，可能已被删除，请刷新列表。',
  WORKFLOW_CREATE_FAILED: '创建失败，请检查 table scope 与 JSON 配置是否正确。',
  WORKFLOW_UPDATE_FAILED: '更新失败，请确认配置后重试。',
  WORKFLOW_DELETE_FAILED: '删除失败，请稍后再试。',
  WORKFLOW_LIST_FAILED: '加载工作流列表失败，请检查服务与数据库连接。',
  WORKFLOW_GET_FAILED: '获取工作流详情失败，请稍后重试。',
}

export class ApiError extends Error {
  constructor({ code, message, status, details }) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.details = details
  }
}

function toFriendlyMessage(code, fallbackMessage, status) {
  if (code && FRIENDLY_ERROR_MESSAGES[code]) {
    return FRIENDLY_ERROR_MESSAGES[code]
  }

  if (typeof status === 'number' && status >= 500) {
    return '服务暂时不可用，请稍后重试。'
  }

  return fallbackMessage || '请求失败，请稍后重试。'
}

async function requestJson(url, options = {}) {
  const headers = {
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {}),
  }

  const response = await fetch(url, {
    ...options,
    headers,
  })

  const rawText = await response.text()
  let payload = null

  if (rawText) {
    try {
      payload = JSON.parse(rawText)
    } catch {
      payload = null
    }
  }

  const code = payload?.code
  const message = payload?.message || `请求失败（HTTP ${response.status}）`

  if (!response.ok || code !== 'OK') {
    throw new ApiError({
      code: code || `HTTP_${response.status}`,
      status: response.status,
      message: toFriendlyMessage(code, message, response.status),
      details: payload?.details,
    })
  }

  return {
    code,
    message,
    data: payload?.data,
    meta: payload?.meta,
  }
}

function buildListQuery({ limit, offset, isActive }) {
  const params = new URLSearchParams()
  params.set('limit', String(limit))
  params.set('offset', String(offset))

  if (isActive === 'true' || isActive === 'false') {
    params.set('isActive', isActive)
  }

  return params.toString()
}

export async function fetchWorkflowList({ limit, offset, isActive }) {
  const query = buildListQuery({ limit, offset, isActive })
  return requestJson(`${WORKFLOW_API_BASE}?${query}`)
}

export async function fetchWorkflowDetail(id) {
  return requestJson(`${WORKFLOW_API_BASE}/${encodeURIComponent(id)}`)
}

export async function createWorkflow(payload) {
  return requestJson(WORKFLOW_API_BASE, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function updateWorkflow(id, payload) {
  return requestJson(`${WORKFLOW_API_BASE}/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export async function deleteWorkflow(id) {
  return requestJson(`${WORKFLOW_API_BASE}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

export function toUserFacingError(error) {
  if (error instanceof ApiError) {
    return {
      code: error.code,
      message: error.message,
    }
  }

  return {
    code: 'UNKNOWN_ERROR',
    message: '发生未知错误，请稍后重试。',
  }
}
