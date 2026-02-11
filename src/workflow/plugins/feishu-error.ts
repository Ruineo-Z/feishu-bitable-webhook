interface FeishuErrorPayload {
  code?: number | string
  msg?: string
  message?: string
  log_id?: string
  troubleshooter?: string
}

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}

export function extractFeishuErrorPayload(error: unknown): FeishuErrorPayload | null {
  if (!error) return null

  if (Array.isArray(error)) {
    for (const item of error) {
      const extracted = extractFeishuErrorPayload(item)
      if (extracted) return extracted
    }
  }

  if (!isObjectLike(error)) return null

  const candidate = error as Record<string, unknown>
  if ('code' in candidate || 'msg' in candidate || 'log_id' in candidate || 'troubleshooter' in candidate) {
    return {
      code: candidate.code as number | string | undefined,
      msg: (candidate.msg as string | undefined) || (candidate.message as string | undefined),
      message: candidate.message as string | undefined,
      log_id: candidate.log_id as string | undefined,
      troubleshooter: candidate.troubleshooter as string | undefined,
    }
  }

  if (isObjectLike(candidate.response)) {
    const response = candidate.response as Record<string, unknown>
    if (isObjectLike(response.data)) {
      return extractFeishuErrorPayload(response.data)
    }
  }

  if (isObjectLike(candidate.error)) {
    const nested = extractFeishuErrorPayload(candidate.error)
    if (nested) return nested
  }

  return null
}
