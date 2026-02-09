import { client } from '../client'
import { fieldMappingsDb } from '../db/field-mappings'

export interface FieldMappingRefreshResult {
  appToken: string
  tableId: string
  fieldsCount: number
  mappings: Record<string, string>
}

export async function refreshFieldMappingsByTable(
  appToken: string,
  tableId: string,
): Promise<FieldMappingRefreshResult> {
  const res = await client.bitable.v1.appTableField.list({
    path: { app_token: appToken, table_id: tableId },
  })

  const fields = res.data?.items || []
  const mappings: Record<string, string> = {}

  for (const field of fields) {
    if (field.field_id && field.field_name) {
      mappings[field.field_id] = field.field_name
    }
  }

  await fieldMappingsDb.replaceTableMappings(appToken, tableId, mappings)

  return {
    appToken,
    tableId,
    fieldsCount: Object.keys(mappings).length,
    mappings,
  }
}
