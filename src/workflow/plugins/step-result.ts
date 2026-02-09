import { StepResult } from '../types'

interface StepOutput {
  code: string
  durationMs: number
  data?: Record<string, unknown>
  details?: unknown
}

export function okStep(data: Record<string, unknown>, durationMs: number): StepResult {
  const output: StepOutput = {
    code: 'OK',
    durationMs,
    data,
  }

  return {
    success: true,
    output,
  }
}

export function errStep(
  code: string,
  message: string,
  durationMs: number,
  details?: unknown,
): StepResult {
  const output: StepOutput = {
    code,
    durationMs,
    details,
  }

  return {
    success: false,
    error: message,
    output,
  }
}
