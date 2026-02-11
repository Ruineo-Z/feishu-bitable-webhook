import { fieldMappingsDb } from '../../db/field-mappings'

const FIELD_ID_PATTERN = /^fld[a-zA-Z0-9]+$/
const DEFAULT_FIELD_TYPE = 'unknown'

export interface FieldResolverMaps {
  idToName: Record<string, string>
  nameToId: Record<string, string>
  fieldTypeById: Record<string, string>
  fieldTypeByName: Record<string, string>
}

export interface ResolvedFieldMeta {
  fieldName: string
  fieldId?: string
  fieldType: string
  missing: boolean
}

export async function loadFieldResolverMaps(appToken: string, tableId: string): Promise<FieldResolverMaps> {
  const [idToName, nameToId, fieldTypes] = await Promise.all([
    fieldMappingsDb.getIdToNameMap(appToken, tableId),
    fieldMappingsDb.getNameToIdMap(appToken, tableId),
    fieldMappingsDb.getFieldTypeMaps(appToken, tableId),
  ])

  return {
    idToName,
    nameToId,
    fieldTypeById: fieldTypes.fieldTypeById,
    fieldTypeByName: fieldTypes.fieldTypeByName,
  }
}

export function resolveFieldMeta(input: string, maps: FieldResolverMaps): ResolvedFieldMeta {
  const mappedById = maps.idToName[input]
  if (mappedById) {
    return {
      fieldName: mappedById,
      fieldId: input,
      fieldType: maps.fieldTypeById[input] || maps.fieldTypeByName[mappedById] || DEFAULT_FIELD_TYPE,
      missing: false,
    }
  }

  const mappedFieldId = maps.nameToId[input]
  if (mappedFieldId) {
    return {
      fieldName: input,
      fieldId: mappedFieldId,
      fieldType: maps.fieldTypeByName[input] || maps.fieldTypeById[mappedFieldId] || DEFAULT_FIELD_TYPE,
      missing: false,
    }
  }

  const missing = FIELD_ID_PATTERN.test(input)
  return {
    fieldName: input,
    fieldType: maps.fieldTypeByName[input] || DEFAULT_FIELD_TYPE,
    missing,
  }
}

export function resolveFieldName(input: string, maps: FieldResolverMaps): { fieldName: string; missing: boolean } {
  const resolved = resolveFieldMeta(input, maps)
  return {
    fieldName: resolved.fieldName,
    missing: resolved.missing,
  }
}

export function resolveFieldObjectKeys(
  fields: Record<string, unknown>,
  maps: FieldResolverMaps,
): { resolvedFields: Record<string, unknown>; missingFieldIds: string[] } {
  const resolvedFields: Record<string, unknown> = {}
  const missingFieldIds: string[] = []

  for (const [key, value] of Object.entries(fields || {})) {
    const resolved = resolveFieldMeta(key, maps)
    if (resolved.missing) {
      missingFieldIds.push(key)
    }
    resolvedFields[resolved.fieldName] = value
  }

  return {
    resolvedFields,
    missingFieldIds,
  }
}

export function resolveFieldNameList(
  fieldNames: string[],
  maps: FieldResolverMaps,
): { resolvedFieldNames: string[]; missingFieldIds: string[] } {
  const resolvedFieldNames: string[] = []
  const missingFieldIds: string[] = []

  for (const fieldName of fieldNames) {
    const resolved = resolveFieldMeta(fieldName, maps)
    if (resolved.missing) {
      missingFieldIds.push(fieldName)
    }
    resolvedFieldNames.push(resolved.fieldName)
  }

  return {
    resolvedFieldNames,
    missingFieldIds,
  }
}
