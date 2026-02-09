export function ok<T>(
  c: any,
  data: T,
  message = '操作成功',
  status = 200,
  meta?: Record<string, unknown>
) {
  return c.json(
    meta ? { code: 'OK', message, data, meta } : { code: 'OK', message, data },
    status
  ) as any
}

export function err(
  c: any,
  code: string,
  message: string,
  status: number,
  details?: unknown
) {
  return c.json(details === undefined ? { code, message } : { code, message, details }, status) as any
}
