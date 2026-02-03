import { getSupabase } from './client'

export interface BitableConfig {
  id?: string
  app_token: string
  name: string
  table_ids: string[]
  field_mappings?: Record<string, string>
  created_at?: string
  updated_at?: string
}

export const bitablesDb = {
  async create(config: Omit<BitableConfig, 'id' | 'created_at' | 'updated_at'>): Promise<BitableConfig> {
    const { data, error } = await getSupabase()
      .from('bitables')
      .insert(config)
      .select()
      .single()

    if (error) throw error
    return data
  },

  async findById(id: string): Promise<BitableConfig | null> {
    const { data, error } = await getSupabase()
      .from('bitables')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw error
    }
    return data
  },

  async findByAppToken(appToken: string): Promise<BitableConfig | null> {
    const { data, error } = await getSupabase()
      .from('bitables')
      .select('*')
      .eq('app_token', appToken)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw error
    }
    return data
  },

  async findAll(): Promise<BitableConfig[]> {
    const { data, error } = await getSupabase()
      .from('bitables')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
  },

  async update(id: string, updates: Partial<BitableConfig>): Promise<BitableConfig> {
    const { data, error } = await getSupabase()
      .from('bitables')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  },

  async delete(id: string): Promise<void> {
    const { error } = await getSupabase()
      .from('bitables')
      .delete()
      .eq('id', id)

    if (error) throw error
  },

  async findByTable(appToken: string, tableId: string): Promise<BitableConfig | null> {
    const { data, error } = await getSupabase()
      .from('bitables')
      .select('*')
      .eq('app_token', appToken)

    if (error) throw error

    const matching = (data || []).filter(bitable => {
      const tableIds = bitable.table_ids
      return tableIds.length === 0 || tableIds.includes(tableId)
    })

    return matching[0] || null
  },

  async getFieldMappings(id: string): Promise<Record<string, string>> {
    const { data, error } = await getSupabase()
      .from('bitables')
      .select('field_mappings')
      .eq('id', id)
      .single()

    if (error) throw error
    return data?.field_mappings || {}
  },

  async updateFieldMappings(id: string, mappings: Record<string, string>): Promise<void> {
    const { error } = await getSupabase()
      .from('bitables')
      .update({
        field_mappings: mappings,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)

    if (error) throw error
  },

  async addFieldMapping(id: string, fieldId: string, fieldName: string): Promise<void> {
    const { data, error } = await getSupabase()
      .from('bitables')
      .select('field_mappings')
      .eq('id', id)
      .single()

    if (error) throw error

    const mappings = (data?.field_mappings as Record<string, string>) || {}
    mappings[fieldId] = fieldName

    const { error: updateError } = await getSupabase()
      .from('bitables')
      .update({
        field_mappings: mappings,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)

    if (updateError) throw updateError
  },

  async removeFieldMapping(id: string, fieldId: string): Promise<void> {
    const { data, error } = await getSupabase()
      .from('bitables')
      .select('field_mappings')
      .eq('id', id)
      .single()

    if (error) throw error

    const mappings = { ...(data?.field_mappings as Record<string, string>) }
    delete mappings[fieldId]

    const { error: updateError } = await getSupabase()
      .from('bitables')
      .update({
        field_mappings: mappings,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)

    if (updateError) throw updateError
  }
}
