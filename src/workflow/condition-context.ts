import { EvaluationContext } from '../engine/condition-evaluator'
import { WorkflowContext } from './types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeStringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {}

  const normalized: Record<string, string> = {}
  for (const [key, raw] of Object.entries(value)) {
    const keyText = String(key || '').trim()
    if (!keyText) continue

    if (typeof raw === 'string' || typeof raw === 'number') {
      const valueText = String(raw).trim()
      if (valueText) {
        normalized[keyText] = valueText
      }
    }
  }

  return normalized
}

function mergeStringRecords(...records: Array<Record<string, string>>): Record<string, string> {
  const merged: Record<string, string> = {}
  for (const item of records) {
    Object.assign(merged, item)
  }
  return merged
}

function deriveFieldTypesByNameFromIds(
  fieldTypesById: Record<string, string>,
  fieldIdToName: Record<string, string>,
  existingFieldTypesByName: Record<string, string>,
) {
  const derived: Record<string, string> = {}
  for (const [fieldId, fieldType] of Object.entries(fieldTypesById)) {
    const fieldName = fieldIdToName[fieldId]
    if (!fieldName) continue
    if (existingFieldTypesByName[fieldName]) continue
    derived[fieldName] = fieldType
  }
  return derived
}

function buildConditionFieldTypes(trigger: unknown): Record<string, string> {
  const triggerRecord = isRecord(trigger) ? trigger : {}
  const record = isRecord(triggerRecord.record) ? triggerRecord.record : {}

  const fieldTypesByName = mergeStringRecords(
    normalizeStringRecord(record.fieldTypes),
    normalizeStringRecord(record.fieldTypesByName),
    normalizeStringRecord(record.field_types),
    normalizeStringRecord(record.field_types_by_name),
    normalizeStringRecord(triggerRecord.fieldTypes),
    normalizeStringRecord(triggerRecord.fieldTypesByName),
    normalizeStringRecord(triggerRecord.field_types),
    normalizeStringRecord(triggerRecord.field_types_by_name),
  )

  const fieldTypesById = mergeStringRecords(
    normalizeStringRecord(record.fieldTypesById),
    normalizeStringRecord(record.field_types_by_id),
    normalizeStringRecord(triggerRecord.fieldTypesById),
    normalizeStringRecord(triggerRecord.field_types_by_id),
  )

  const fieldIdToName = mergeStringRecords(
    normalizeStringRecord(record.fieldIdToName),
    normalizeStringRecord(record.field_id_to_name),
    normalizeStringRecord(triggerRecord.fieldIdToName),
    normalizeStringRecord(triggerRecord.field_id_to_name),
  )

  const derivedByName = deriveFieldTypesByNameFromIds(fieldTypesById, fieldIdToName, fieldTypesByName)

  return {
    ...fieldTypesById,
    ...derivedByName,
    ...fieldTypesByName,
  }
}

export function buildConditionEvaluationContext(context: WorkflowContext): EvaluationContext {
  const trigger = isRecord(context.trigger) ? context.trigger : {}
  const record = isRecord(trigger.record) ? trigger.record : {}

  return {
    fields: isRecord(record.fields) ? record.fields : {},
    beforeFields: isRecord(record.beforeFields) ? record.beforeFields : {},
    recordId: typeof trigger.record_id === 'string' ? trigger.record_id : '',
    action: Array.isArray(trigger.action_list)
      ? (isRecord(trigger.action_list[0]) && typeof trigger.action_list[0].action === 'string'
          ? trigger.action_list[0].action
          : 'unknown')
      : 'unknown',
    operatorOpenId: isRecord(trigger.operator_id) && typeof trigger.operator_id.open_id === 'string'
      ? trigger.operator_id.open_id
      : undefined,
    fieldTypes: buildConditionFieldTypes(trigger),
  }
}
