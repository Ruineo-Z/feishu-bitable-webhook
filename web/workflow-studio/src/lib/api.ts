import type { ApiEnvelope, WorkflowDetail, WorkflowSummary } from '../types/workflow'

const WORKFLOW_API_BASE = '/api/workflows'

const FRIENDLY_ERROR_MESSAGES: Record<string, string> = {
  WORKFLOW_NOT_FOUND: '工作流不存在，可能已被删除，请刷新列表。',
  WORKFLOW_CREATE_FAILED: '创建失败，请检查 scope 与 DSL 配置是否正确。',
  WORKFLOW_UPDATE_FAILED: '更新失败，请确认配置后重试。',
  WORKFLOW_DELETE_FAILED: '删除失败，请稍后再试。',
  WORKFLOW_LIST_FAILED: '加载工作流列表失败，请检查服务与数据库连接。',
  WORKFLOW_GET_FAILED: '获取工作流详情失败，请稍后重试。',
  WORKFLOW_SCOPE_TABLE_REQUIRED: 'scope 必须是 table，且必须包含 appToken 与 tableId。',
  WORKFLOW_EVENT_TYPES_INVALID: 'eventTypes 只支持 record_created/record_updated/record_deleted（可用 add/update/remove）。',
  WORKFLOW_EVENT_TYPES_CONFLICT: 'scope.eventTypes 与 trigger.config.action/actions 冲突，请保持一致。',
}

export class ApiError extends Error {
  code: string
  status: number
  details?: unknown

  constructor(params: { code: string; status: number; message: string; details?: unknown }) {
    super(params.message)
    this.name = 'ApiError'
    this.code = params.code
    this.status = params.status
    this.details = params.details
  }
}

function toFriendlyMessage(code: string | undefined, fallback: string, status: number): string {
  if (code && FRIENDLY_ERROR_MESSAGES[code]) {
    return FRIENDLY_ERROR_MESSAGES[code]
  }

  if (status >= 500) {
    return '服务暂时不可用，请稍后重试。'
  }

  return fallback || '请求失败，请稍后重试。'
}

async function requestJson<TData>(url: string, options: RequestInit = {}): Promise<ApiEnvelope<TData>> {
  const headers = {
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {}),
  }

  const response = await fetch(url, {
    ...options,
    headers,
  })

  const rawText = await response.text()
  let payload: ApiEnvelope<TData> | null = null

  if (rawText) {
    try {
      payload = JSON.parse(rawText) as ApiEnvelope<TData>
    } catch {
      payload = null
    }
  }

  if (!response.ok || payload?.code !== 'OK') {
    const code = payload?.code || `HTTP_${response.status}`
    const message = payload?.message || `请求失败（HTTP ${response.status}）`
    throw new ApiError({
      code,
      status: response.status,
      message: toFriendlyMessage(code, message, response.status),
      details: payload?.details,
    })
  }

  return payload
}

export function toUserFacingError(error: unknown): { code: string; message: string } {
  if (error instanceof ApiError) {
    return {
      code: error.code,
      message: error.message,
    }
  }

  if (error instanceof Error) {
    return {
      code: 'UNKNOWN_ERROR',
      message: error.message || '发生未知错误，请稍后重试。',
    }
  }

  return {
    code: 'UNKNOWN_ERROR',
    message: '发生未知错误，请稍后重试。',
  }
}

interface ListQuery {
  isActive: 'all' | 'true' | 'false'
  limit: number
  offset: number
}

function buildListQuery({ isActive, limit, offset }: ListQuery): string {
  const params = new URLSearchParams()
  params.set('limit', String(limit))
  params.set('offset', String(offset))
  if (isActive === 'true' || isActive === 'false') {
    params.set('isActive', isActive)
  }
  return params.toString()
}

export async function fetchWorkflowList(query: ListQuery) {
  return requestJson<WorkflowSummary[]>(`${WORKFLOW_API_BASE}?${buildListQuery(query)}`)
}

export async function fetchWorkflowDetail(id: string) {
  return requestJson<WorkflowDetail>(`${WORKFLOW_API_BASE}/${encodeURIComponent(id)}`)
}

export async function createWorkflow(payload: unknown) {
  return requestJson<WorkflowDetail>(WORKFLOW_API_BASE, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function updateWorkflow(id: string, payload: unknown) {
  return requestJson<WorkflowDetail>(`${WORKFLOW_API_BASE}/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export async function deleteWorkflow(id: string) {
  return requestJson<{ id: string }>(`${WORKFLOW_API_BASE}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}
