import { getSupabase } from './client'

export interface BitableConfig {
  id?: string
  app_token: string
  name: string           // 多维表格名称
  table_id: string       // 表 ID
  table_name?: string    // 表名称（可选）
  field_mappings?: Record<string, string>
  created_at?: string
  updated_at?: string
}

// ============ 配置缓存层 ============
interface CacheEntry {
  config: BitableConfig
  timestamp: number
}

const TABLE_CACHE_TTL = 5 * 60 * 1000 // 5分钟缓存
const tableCache = new Map<string, CacheEntry>() // key: "app_token:table_id"

function getCacheKey(appToken: string, tableId: string): string {
  return `${appToken}:${tableId}`
}

function getTableCache(appToken: string, tableId: string): BitableConfig | null {
  const key = getCacheKey(appToken, tableId)
  const entry = tableCache.get(key)
  if (!entry) return null

  if (Date.now() - entry.timestamp > TABLE_CACHE_TTL) {
    tableCache.delete(key)
    return null
  }
  return entry.config
}

function setTableCache(appToken: string, tableId: string, config: BitableConfig): void {
  const key = getCacheKey(appToken, tableId)
  tableCache.set(key, { config, timestamp: Date.now() })
}

function invalidateTableCache(appToken: string, tableId: string): void {
  const key = getCacheKey(appToken, tableId)
  tableCache.delete(key)
}

// ============ 数据库操作 ============

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

  async findByAppToken(appToken: string): Promise<BitableConfig[]> {
    const { data, error } = await getSupabase()
      .from('bitables')
      .select('*')
      .eq('app_token', appToken)

    if (error) throw error
    return data || []
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

  // 根据 app_token + table_id 查找（带缓存）
  async findByTable(appToken: string, tableId: string): Promise<BitableConfig | null> {
    // 先查缓存
    const cached = getTableCache(appToken, tableId)
    if (cached) return cached

    // 缓存未命中，查数据库
    const { data, error } = await getSupabase()
      .from('bitables')
      .select('*')
      .eq('app_token', appToken)
      .eq('table_id', tableId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw error
    }

    // 写入缓存
    if (data) {
      setTableCache(appToken, tableId, data)
    }

    return data
  },

  // 根据 app_token 查找所有关联的表
  async findTablesByAppToken(appToken: string): Promise<BitableConfig[]> {
    const { data, error } = await getSupabase()
      .from('bitables')
      .select('*')
      .eq('app_token', appToken)

    if (error) throw error
    return data || []
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
      .select('app_token, table_id, field_mappings')
      .eq('id', id)
      .single()

    if (error) throw error

    const appToken = data?.app_token
    const tableId = data?.table_id
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

    // 清除缓存，确保下次查询获取最新配置
    if (appToken && tableId) {
      invalidateTableCache(appToken, tableId)
    }
  },

  async removeFieldMapping(id: string, fieldId: string): Promise<void> {
    const { data, error } = await getSupabase()
      .from('bitables')
      .select('app_token, table_id, field_mappings')
      .eq('id', id)
      .single()

    if (error) throw error

    const appToken = data?.app_token
    const tableId = data?.table_id
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

    // 清除缓存
    if (appToken && tableId) {
      invalidateTableCache(appToken, tableId)
    }
  }
}

// 导出缓存管理函数（供外部使用）
export const bitablesCache = {
  get: getTableCache,
  set: setTableCache,
  invalidate: invalidateTableCache,
  clear: () => tableCache.clear()
}
