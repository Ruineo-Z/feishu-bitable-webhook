import { getSupabase } from './client'

export interface ExecutionLog {
  id?: string
  rule_id: string
  rule_name?: string
  trigger_action: string
  record_id: string
  operator_openid?: string
  record_snapshot?: Record<string, unknown>
  status: 'success' | 'failed' | 'partial'
  error_message?: string
  duration_ms?: number
  response?: Record<string, unknown>
  created_at?: string
}

export interface LogFilter {
  ruleId?: string
  status?: 'success' | 'failed' | 'partial'
  operatorOpenId?: string
  startDate?: string
  endDate?: string
  limit?: number
  offset?: number
}

export const executionLogsDb = {
  async create(log: Omit<ExecutionLog, 'id' | 'created_at'>): Promise<ExecutionLog> {
    const { data, error } = await getSupabase()
      .from('execution_logs')
      .insert(log as ExecutionLog)
      .select()
      .single()

    if (error) throw error
    return data
  },

  async findById(id: string): Promise<ExecutionLog | null> {
    const { data, error } = await getSupabase()
      .from('execution_logs')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw error
    }
    return data
  },

  async find(filter: LogFilter = {}): Promise<ExecutionLog[]> {
    let query = getSupabase()
      .from('execution_logs')
      .select('*')
      .order('created_at', { ascending: false })

    if (filter.ruleId) {
      query = query.eq('rule_id', filter.ruleId)
    }
    if (filter.status) {
      query = query.eq('status', filter.status)
    }
    if (filter.operatorOpenId) {
      query = query.eq('operator_openid', filter.operatorOpenId)
    }
    if (filter.startDate) {
      query = query.gte('created_at', filter.startDate)
    }
    if (filter.endDate) {
      query = query.lte('created_at', filter.endDate)
    }
    if (filter.limit) {
      query = query.limit(filter.limit)
    }
    if (filter.offset) {
      query = query.range(filter.offset, filter.offset + (filter.limit || 50) - 1)
    }

    const { data, error } = await query

    if (error) throw error
    return data || []
  },

  async count(filter: LogFilter = {}): Promise<number> {
    let query = getSupabase()
      .from('execution_logs')
      .select('*', { count: 'exact', head: true })

    if (filter.ruleId) {
      query = query.eq('rule_id', filter.ruleId)
    }
    if (filter.status) {
      query = query.eq('status', filter.status)
    }
    if (filter.operatorOpenId) {
      query = query.eq('operator_openid', filter.operatorOpenId)
    }
    if (filter.startDate) {
      query = query.gte('created_at', filter.startDate)
    }
    if (filter.endDate) {
      query = query.lte('created_at', filter.endDate)
    }

    const { count, error } = await query

    if (error) throw error
    return count || 0
  },

  async delete(id: string): Promise<void> {
    const { error } = await getSupabase()
      .from('execution_logs')
      .delete()
      .eq('id', id)

    if (error) throw error
  },

  async deleteOldLogs(olderThan: string): Promise<number> {
    const { count, error } = await getSupabase()
      .from('execution_logs')
      .delete()
      .lt('created_at', olderThan)
      .select('*', { count: 'exact' })

    if (error) throw error
    return count || 0
  }
}
