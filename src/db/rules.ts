import { getSupabase } from './client'

export interface ConditionExpression {
  field: string
  operator: string
  value: string | number | boolean
}

export interface Condition {
  logic: 'AND' | 'OR'
  expressions: ConditionExpression[]
}

export interface TriggerConfig {
  app_token: string
  table_id: string
  actions: string[]
  condition?: Condition
}

export interface ActionParams {
  receive_id?: string
  receive_id_type?: string
  content?: string
  url?: string
  method?: string
  headers?: Record<string, string>
  body?: unknown
  app_token?: string
  table_id?: string
  record_id?: string
  fields?: Record<string, unknown>
  [key: string]: unknown
}

export interface ActionConfig {
  type: string
  params: ActionParams
}

export interface RuleConfig {
  id?: string
  name: string
  enabled: boolean
  bitable_id: string
  trigger: TriggerConfig
  action: ActionConfig
  on_failure: 'continue' | 'stop'
  created_at?: string
  updated_at?: string
}

export const rulesDb = {
  async create(rule: Omit<RuleConfig, 'id' | 'created_at' | 'updated_at'>): Promise<RuleConfig> {
    const { data, error } = await getSupabase()
      .from('rules')
      .insert(rule)
      .select()
      .single()

    if (error) throw error
    return data
  },

  async findById(id: string): Promise<RuleConfig | null> {
    const { data, error } = await getSupabase()
      .from('rules')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw error
    }
    return data
  },

  async findEnabledByAppToken(appToken: string): Promise<RuleConfig[]> {
    const { data, error } = await getSupabase()
      .from('rules')
      .select('*')
      .eq('enabled', true)
      .eq('trigger->>app_token', appToken)
      .order('created_at', { ascending: true })

    if (error) throw error
    return data || []
  },

  async findAll(): Promise<RuleConfig[]> {
    const { data, error } = await getSupabase()
      .from('rules')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
  },

  async update(id: string, updates: Partial<RuleConfig>): Promise<RuleConfig> {
    const { data, error } = await getSupabase()
      .from('rules')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  },

  async delete(id: string): Promise<void> {
    const { error } = await getSupabase()
      .from('rules')
      .delete()
      .eq('id', id)

    if (error) throw error
  },

  async toggleEnabled(id: string, enabled: boolean): Promise<RuleConfig> {
    return this.update(id, { enabled })
  },

  async findByBitable(bitableId: string): Promise<RuleConfig[]> {
    const { data, error } = await getSupabase()
      .from('rules')
      .select('*')
      .eq('bitable_id', bitableId)
      .eq('enabled', true)
      .order('created_at', { ascending: true })

    if (error) throw error
    return data || []
  }
}
