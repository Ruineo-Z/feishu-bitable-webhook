import colors from 'colors'

colors.enable()

function generateTraceId(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase()
}

function getCallerLocation(): string {
  const stack = new Error().stack
  if (!stack) return 'unknown:0'
  const lines = stack.split('\n').slice(3)
  for (const line of lines) {
    const match = line.match(/at\s+(?:.*\s+)?(.+):(\d+):\d+/)
    if (match) {
      const file = match[1].split('/').pop() || 'unknown'
      return `${file}:${match[2]}`
    }
  }
  return 'unknown:0'
}

function serializeUnknown(value: unknown, seen: WeakSet<object> = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) {
    return value
  }

  if (typeof value === 'bigint') {
    return String(value)
  }

  if (value instanceof Error) {
    const errorLike: Record<string, unknown> = {
      name: value.name,
      message: value.message,
    }

    if (value.stack) {
      errorLike.stack = value.stack
    }

    for (const key of Object.getOwnPropertyNames(value)) {
      if (key === 'name' || key === 'message' || key === 'stack') {
        continue
      }

      const raw = (value as unknown as Record<string, unknown>)[key]
      errorLike[key] = serializeUnknown(raw, seen)
    }

    return errorLike
  }

  if (typeof value === 'object') {
    if (seen.has(value as object)) {
      return '[Circular]'
    }

    seen.add(value as object)

    if (Array.isArray(value)) {
      return value.map((item) => serializeUnknown(item, seen))
    }

    const output: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      output[key] = serializeUnknown(item, seen)
    }

    return output
  }

  return value
}

function stringifyUnknown(value: unknown): string {
  if (typeof value === 'string') return value
  if (value === undefined) return 'undefined'

  if (typeof value === 'object' || typeof value === 'bigint') {
    try {
      const serialized = serializeUnknown(value)
      const text = JSON.stringify(serialized, null, 2)
      if (text !== undefined) return text
    } catch {
      return String(value)
    }
  }

  return String(value)
}

function formatMessage(args: unknown[]): string {
  return args.map((item) => stringifyUnknown(item)).join(' ')
}

function formatLog(level: string, colorFn: (s: string) => string, args: unknown[], traceId?: string, caller?: string) {
  const timestamp = new Date().toISOString().slice(11, 23)
  const msg = formatMessage(args)
  console.log(`[${timestamp}] [${colorFn(level)}] [${traceId || generateTraceId()}] ${caller || getCallerLocation()} ${msg}`)
}

interface LoggerInterface {
  info: (...args: unknown[]) => void
  success: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  debug: (...args: unknown[]) => void
  withTrace: (traceId: string) => LoggerInterface
  at: (caller: string) => LoggerInterface
}

function createLogger(baseTraceId?: string): LoggerInterface {
  const l: LoggerInterface = {
    info: (...args) => formatLog('INFO', colors.cyan, args, baseTraceId),
    success: (...args) => formatLog('SUCCESS', colors.green, args, baseTraceId),
    error: (...args) => formatLog('ERROR', colors.red, args, baseTraceId),
    warn: (...args) => formatLog('WARN', colors.yellow, args, baseTraceId),
    debug: (...args) => formatLog('DEBUG', colors.gray, args, baseTraceId),
    withTrace: (traceId: string) => createLogger(traceId),
    at: (caller: string) => createLoggerWithCaller(baseTraceId, caller),
  }
  return l
}

function createLoggerWithCaller(baseTraceId: string | undefined, caller: string): LoggerInterface {
  return {
    info: (...args) => formatLog('INFO', colors.cyan, args, baseTraceId, caller),
    success: (...args) => formatLog('SUCCESS', colors.green, args, baseTraceId, caller),
    error: (...args) => formatLog('ERROR', colors.red, args, baseTraceId, caller),
    warn: (...args) => formatLog('WARN', colors.yellow, args, baseTraceId, caller),
    debug: (...args) => formatLog('DEBUG', colors.gray, args, baseTraceId, caller),
    withTrace: (traceId: string) => createLoggerWithCaller(traceId, caller),
    at: (newCaller: string) => createLoggerWithCaller(baseTraceId, newCaller),
  }
}

export const logger = createLogger()

export function createFeishuLogger(traceId: string) {
  return logger.withTrace(traceId).at('lark.ts')
}

export function createLoggerWithTrace(traceId: string, caller?: string) {
  if (caller) {
    return createLoggerWithCaller(traceId, caller)
  }
  return createLogger(traceId)
}

export const log = logger.info

export function createEventTraceId(): string {
  return `EVT-${Date.now().toString(36).toUpperCase()}-${generateTraceId()}`
}
