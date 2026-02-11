import { getSupabase } from './client'
import { client } from '../client'
import { createLoggerWithTrace } from '../logger'

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

interface TableFieldSchemaEntry {
  fieldTypeById: Record<string, string>
  fieldTypeByName: Record<string, string>
  timestamp: number
  source: 'runtime-cache' | 'remote-api' | 'empty-fallback'
}

interface FeishuFieldSchemaItem {
  field_id?: string
  field_name?: string
  type?: string | number
  field_type?: string | number
}

const TABLE_CACHE_TTL = 5 * 60 * 1000
const tableCache = new Map<string, TableCacheEntry>()
const tableSchemaCache = new Map<string, TableFieldSchemaEntry>()

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

function getTableSchemaCache(appToken: string, tableId: string): TableFieldSchemaEntry | null {
  const key = getTableCacheKey(appToken, tableId)
  const entry = tableSchemaCache.get(key)
  if (!entry) return null

  if (Date.now() - entry.timestamp > TABLE_CACHE_TTL) {
    tableSchemaCache.delete(key)
    return null
  }

  return entry
}

function setTableSchemaCache(
  appToken: string,
  tableId: string,
  fieldTypeById: Record<string, string>,
  fieldTypeByName: Record<string, string>,
  source: TableFieldSchemaEntry['source'],
): void {
  tableSchemaCache.set(getTableCacheKey(appToken, tableId), {
    fieldTypeById,
    fieldTypeByName,
    timestamp: Date.now(),
    source,
  })
}

function normalizeRawFieldType(typeValue: string | number | undefined): string {
  if (typeValue === undefined || typeValue === null) return 'unknown'
  return String(typeValue).trim().toLowerCase()
}

function buildSchemaMapsFromFeishuItems(items: FeishuFieldSchemaItem[] | undefined): {
  fieldTypeById: Record<string, string>
  fieldTypeByName: Record<string, string>
} {
  const fieldTypeById: Record<string, string> = {}
  const fieldTypeByName: Record<string, string> = {}

  for (const item of items || []) {
    const fieldId = item.field_id
    const fieldName = item.field_name
    if (!fieldId || !fieldName) continue

    const rawType = item.field_type !== undefined ? item.field_type : item.type
    const normalizedType = normalizeRawFieldType(rawType)
    fieldTypeById[fieldId] = normalizedType
    fieldTypeByName[fieldName] = normalizedType
  }

  return {
    fieldTypeById,
    fieldTypeByName,
  }
}

function invalidateTableCache(appToken: string, tableId: string): void {
  const key = getTableCacheKey(appToken, tableId)
  tableCache.delete(key)
  tableSchemaCache.delete(key)
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

  hydrateTableFieldTypes(
    appToken: string,
    tableId: string,
    items: FeishuFieldSchemaItem[],
    source: TableFieldSchemaEntry['source'] = 'runtime-cache',
  ): void {
    const schemaMaps = buildSchemaMapsFromFeishuItems(items)
    setTableSchemaCache(appToken, tableId, schemaMaps.fieldTypeById, schemaMaps.fieldTypeByName, source)
  },

  async getFieldTypeMaps(appToken: string, tableId: string): Promise<{
    fieldTypeById: Record<string, string>
    fieldTypeByName: Record<string, string>
    source: TableFieldSchemaEntry['source']
  }> {
    const cached = getTableSchemaCache(appToken, tableId)
    if (cached) {
      return {
        fieldTypeById: cached.fieldTypeById,
        fieldTypeByName: cached.fieldTypeByName,
        source: cached.source,
      }
    }

    if (!process.env.FEISHU_APP_ID || !process.env.FEISHU_APP_SECRET) {
      setTableSchemaCache(appToken, tableId, {}, {}, 'empty-fallback')
      return {
        fieldTypeById: {},
        fieldTypeByName: {},
        source: 'empty-fallback',
      }
    }

    try {
      const res = await (client as any).bitable.v1.appTableField.list({
        path: {
          app_token: appToken,
          table_id: tableId,
        },
      })
      const items = (res?.data?.items || []) as FeishuFieldSchemaItem[]
      const schemaMaps = buildSchemaMapsFromFeishuItems(items)

      setTableSchemaCache(
        appToken,
        tableId,
        schemaMaps.fieldTypeById,
        schemaMaps.fieldTypeByName,
        'remote-api',
      )

      return {
        fieldTypeById: schemaMaps.fieldTypeById,
        fieldTypeByName: schemaMaps.fieldTypeByName,
        source: 'remote-api',
      }
    } catch (error) {
      const logger = createLoggerWithTrace('FIELD-SCHEMA', 'field-mappings.ts')
      logger.warn('获取字段类型元信息失败，降级为 unknown', {
        appToken,
        tableId,
        error: error instanceof Error ? error.message : String(error),
      })

      setTableSchemaCache(appToken, tableId, {}, {}, 'empty-fallback')
      return {
        fieldTypeById: {},
        fieldTypeByName: {},
        source: 'empty-fallback',
      }
    }
  },

  async getFieldTypeByFieldId(appToken: string, tableId: string, fieldId: string): Promise<string> {
    const maps = await this.getFieldTypeMaps(appToken, tableId)
    return maps.fieldTypeById[fieldId] || 'unknown'
  },

  async getFieldTypeByFieldName(appToken: string, tableId: string, fieldName: string): Promise<string> {
    const maps = await this.getFieldTypeMaps(appToken, tableId)
    return maps.fieldTypeByName[fieldName] || 'unknown'
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
  clear: () => {
    tableCache.clear()
    tableSchemaCache.clear()
  },
  invalidate: invalidateTableCache,
}
