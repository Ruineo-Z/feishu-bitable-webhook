import { getSupabase } from './client'

/**
 * 动作执行记录
 */
export interface ActionExecution {
  name: string
  type: string
  params: Record<string, unknown>
  status: 'success' | 'failed'
  error?: string
  durationMs: number
  response?: Record<string, unknown>
}

/**
 * 执行日志
 */
export interface ExecutionLog {
  id: string
  rule_id: string
  rule_name: string | null
  trigger_action: string
  record_id: string
  operator_openid: string | null
  record_snapshot: Record<string, unknown> | null
  status: string
  error_message: string | null
  duration_ms: number | null
  response: Record<string, unknown> | null
  created_at: string
  rule_version?: number | null
  fields?: Record<string, unknown> | null
  beforeFields?: Record<string, unknown> | null
  actions?: ActionExecution[] | null
  totalDurationMs?: number | null
}

/**
 * 日志筛选条件
 */
export interface LogFilter {
  ruleId?: string
  status?: 'success' | 'failed' | 'partial'
  operatorOpenId?: string
  startDate?: string
  endDate?: string
  limit?: number
  offset?: number
  actionType?: string
  minDuration?: number
  maxDuration?: number
}

/**
 * 执行统计信息
 */
export interface ExecutionStatistics {
  total: number
  success: number
  failed: number
  partial: number
  avgDuration: number
}

export const executionLogsDb = {
  async create(log: Record<string, unknown>): Promise<ExecutionLog> {
    const { data, error } = await getSupabase()
      .from('execution_logs')
      .insert(log as any)
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
    const result = await getSupabase()
      .from('execution_logs')
      .delete()
      .lt('created_at', olderThan)

    const { count, error } = result
    if (error) throw error
    return count || 0
  },

  /**
   * 获取执行统计
   */
  async getStatistics(filter: LogFilter = {}): Promise<ExecutionStatistics> {
    const logs = await this.find(filter)

    const stats: ExecutionStatistics = {
      total: logs.length,
      success: logs.filter(l => l.status === 'success').length,
      failed: logs.filter(l => l.status === 'failed').length,
      partial: logs.filter(l => l.status === 'partial').length,
      avgDuration: 0,
    }

    if (logs.length > 0) {
      const totalDuration = logs.reduce(
        (sum, l) => sum + (l.duration_ms || l.totalDurationMs || 0),
        0
      )
      stats.avgDuration = Math.round(totalDuration / logs.length)
    }

    return stats
  }
}
