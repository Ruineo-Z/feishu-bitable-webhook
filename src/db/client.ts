import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let _supabase: SupabaseClient | null = null

type FetchInput = Parameters<typeof fetch>[0]
type FetchInit = Parameters<typeof fetch>[1]

const SUPABASE_FETCH_MAX_RETRIES = Math.max(Number(process.env.SUPABASE_FETCH_MAX_RETRIES || 2), 0)
const SUPABASE_FETCH_RETRY_BASE_MS = Math.max(Number(process.env.SUPABASE_FETCH_RETRY_BASE_MS || 150), 0)
const RETRIABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504])

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function isRetriableNetworkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  const normalized = message.toLowerCase()

  return (
    normalized.includes('socket connection was closed unexpectedly')
    || normalized.includes('fetch failed')
    || normalized.includes('econnreset')
    || normalized.includes('etimedout')
    || normalized.includes('network')
    || normalized.includes('connection reset')
  )
}

async function fetchWithRetry(input: FetchInput, init?: FetchInit): Promise<Response> {
  let lastError: unknown

  for (let attempt = 0; attempt <= SUPABASE_FETCH_MAX_RETRIES; attempt += 1) {
    try {
      const response = await fetch(input, init)

      if (!RETRIABLE_STATUS_CODES.has(response.status) || attempt === SUPABASE_FETCH_MAX_RETRIES) {
        return response
      }

      const delay = SUPABASE_FETCH_RETRY_BASE_MS * (2 ** attempt)
      console.warn(`[SUPABASE] HTTP ${response.status}，${delay}ms 后重试 (${attempt + 1}/${SUPABASE_FETCH_MAX_RETRIES})`)
      await wait(delay)
    } catch (error) {
      lastError = error

      if (!isRetriableNetworkError(error) || attempt === SUPABASE_FETCH_MAX_RETRIES) {
        throw error
      }

      const delay = SUPABASE_FETCH_RETRY_BASE_MS * (2 ** attempt)
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`[SUPABASE] 网络异常(${message})，${delay}ms 后重试 (${attempt + 1}/${SUPABASE_FETCH_MAX_RETRIES})`)
      await wait(delay)
    }
  }

  if (lastError instanceof Error) {
    throw lastError
  }

  throw new Error('Supabase fetch failed with unknown error')
}

export function getSupabase(): SupabaseClient {
  if (_supabase) {
    return _supabase
  }

  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_KEY

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_KEY environment variable')
  }

  _supabase = createClient(supabaseUrl, supabaseKey, {
    global: {
      fetch: fetchWithRetry,
    },
  })
  return _supabase
}
