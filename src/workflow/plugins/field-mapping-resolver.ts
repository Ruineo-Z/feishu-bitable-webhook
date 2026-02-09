import { fieldMappingsDb } from '../../db/field-mappings'

const FIELD_ID_PATTERN = /^fld[a-zA-Z0-9]+$/

export interface FieldResolverMaps {
  idToName: Record<string, string>
  nameToId: Record<string, string>
}

export async function loadFieldResolverMaps(appToken: string, tableId: string): Promise<FieldResolverMaps> {
  const [idToName, nameToId] = await Promise.all([
    fieldMappingsDb.getIdToNameMap(appToken, tableId),
    fieldMappingsDb.getNameToIdMap(appToken, tableId),
  ])

  return {
    idToName,
    nameToId,
  }
}

export function resolveFieldName(input: string, maps: FieldResolverMaps): { fieldName: string; missing: boolean } {
  const mappedById = maps.idToName[input]
  if (mappedById) {
    return {
      fieldName: mappedById,
      missing: false,
    }
  }

  return {
    fieldName: input,
    missing: FIELD_ID_PATTERN.test(input),
  }
}

export function resolveFieldObjectKeys(
  fields: Record<string, unknown>,
  maps: FieldResolverMaps,
): { resolvedFields: Record<string, unknown>; missingFieldIds: string[] } {
  const resolvedFields: Record<string, unknown> = {}
  const missingFieldIds: string[] = []

  for (const [key, value] of Object.entries(fields || {})) {
    const resolved = resolveFieldName(key, maps)
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
    const resolved = resolveFieldName(fieldName, maps)
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
