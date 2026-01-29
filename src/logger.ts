import colors from 'colors'

colors.enable()

function formatTime(date: Date): string {
  return date.toLocaleTimeString('zh-CN', { hour12: false })
}

function formatMessage(args: unknown[]): string {
  return args.map(a => {
    if (typeof a === 'string') return a
    if (typeof a === 'object') return JSON.stringify(a, null, 2)
    return String(a)
  }).join(' ')
}

export const logger = {
  info: (...args: unknown[]) => {
    const msg = formatMessage(args)
    console.log(`[${'INFO'.cyan}]    ${msg} ${formatTime(new Date())}`)
  },
  success: (...args: unknown[]) => {
    const msg = formatMessage(args)
    console.log(`[${'SUCCESS'.green}] ${msg} ${formatTime(new Date())}`)
  },
  error: (...args: unknown[]) => {
    const msg = formatMessage(args)
    console.log(`[${'ERROR'.red}]   ${msg} ${formatTime(new Date())}`)
  },
  warn: (...args: unknown[]) => {
    const msg = formatMessage(args)
    console.log(`[${'WARN'.yellow}]    ${msg} ${formatTime(new Date())}`)
  },
  debug: (...args: unknown[]) => {
    const msg = formatMessage(args)
    console.log(`[${'DEBUG'.gray}]   ${msg} ${formatTime(new Date())}`)
  }
}

export const log = logger.info
