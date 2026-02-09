import { getSupabase } from './client'

export interface FieldMappingRecord {
  id?: string
  app_token: string
  table_id: string
  field_id: string
  field_name: string
  created_at?: string
  updated_at?: string
}

interface TableCacheEntry {
  records: FieldMappingRecord[]
  timestamp: number
}

const TABLE_CACHE_TTL = 5 * 60 * 1000
const tableCache = new Map<string, TableCacheEntry>()

function getTableCacheKey(appToken: string, tableId: string): string {
  return `${appToken}:${tableId}`
}

function getTableCache(appToken: string, tableId: string): FieldMappingRecord[] | null {
  const key = getTableCacheKey(appToken, tableId)
  const entry = tableCache.get(key)
  if (!entry) return null

  if (Date.now() - entry.timestamp > TABLE_CACHE_TTL) {
    tableCache.delete(key)
    return null
  }

  return entry.records
}

function setTableCache(appToken: string, tableId: string, records: FieldMappingRecord[]): void {
  tableCache.set(getTableCacheKey(appToken, tableId), {
    records,
    timestamp: Date.now(),
  })
}

function invalidateTableCache(appToken: string, tableId: string): void {
  tableCache.delete(getTableCacheKey(appToken, tableId))
}

export const fieldMappingsDb = {
  async findByTable(appToken: string, tableId: string): Promise<FieldMappingRecord[]> {
    const cached = getTableCache(appToken, tableId)
    if (cached) {
      return cached
    }

    const { data, error } = await getSupabase()
      .from('bitable_field_mappings')
      .select('*')
      .eq('app_token', appToken)
      .eq('table_id', tableId)
      .order('field_name', { ascending: true })

    if (error) throw error

    const records = (data || []) as FieldMappingRecord[]
    setTableCache(appToken, tableId, records)
    return records
  },

  async getIdToNameMap(appToken: string, tableId: string): Promise<Record<string, string>> {
    const records = await this.findByTable(appToken, tableId)
    return records.reduce<Record<string, string>>((acc, record) => {
      acc[record.field_id] = record.field_name
      return acc
    }, {})
  },

  async getNameToIdMap(appToken: string, tableId: string): Promise<Record<string, string>> {
    const records = await this.findByTable(appToken, tableId)
    return records.reduce<Record<string, string>>((acc, record) => {
      acc[record.field_name] = record.field_id
      return acc
    }, {})
  },

  async upsertOne(appToken: string, tableId: string, fieldId: string, fieldName: string): Promise<void> {
    const { error } = await getSupabase()
      .from('bitable_field_mappings')
      .upsert(
        {
          app_token: appToken,
          table_id: tableId,
          field_id: fieldId,
          field_name: fieldName,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'app_token,table_id,field_id',
        },
      )

    if (error) throw error
    invalidateTableCache(appToken, tableId)
  },

  async removeByFieldId(appToken: string, tableId: string, fieldId: string): Promise<void> {
    const { error } = await getSupabase()
      .from('bitable_field_mappings')
      .delete()
      .eq('app_token', appToken)
      .eq('table_id', tableId)
      .eq('field_id', fieldId)

    if (error) throw error
    invalidateTableCache(appToken, tableId)
  },

  async deleteByTable(appToken: string, tableId: string): Promise<void> {
    const { error } = await getSupabase()
      .from('bitable_field_mappings')
      .delete()
      .eq('app_token', appToken)
      .eq('table_id', tableId)

    if (error) throw error
    invalidateTableCache(appToken, tableId)
  },

  async replaceTableMappings(appToken: string, tableId: string, mappings: Record<string, string>): Promise<void> {
    await this.deleteByTable(appToken, tableId)

    const rows = Object.entries(mappings).map(([fieldId, fieldName]) => ({
      app_token: appToken,
      table_id: tableId,
      field_id: fieldId,
      field_name: fieldName,
    }))

    if (rows.length > 0) {
      const { error } = await getSupabase()
        .from('bitable_field_mappings')
        .insert(rows)

      if (error) throw error
    }

    invalidateTableCache(appToken, tableId)
  },
}

export const fieldMappingsCache = {
  clear: () => tableCache.clear(),
  invalidate: invalidateTableCache,
}
