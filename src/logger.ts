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

function formatMessage(args: unknown[]): string {
  return args.map(a => {
    if (typeof a === 'string') return a
    if (typeof a === 'object') return JSON.stringify(a, null, 2)
    return String(a)
  }).join(' ')
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
    at: (caller: string) => createLoggerWithCaller(baseTraceId, caller)
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
    at: (newCaller: string) => createLoggerWithCaller(baseTraceId, newCaller)
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
