import type { WorkflowEventType } from '../types/workflow'

const EVENT_TYPE_ALIASES: Record<string, WorkflowEventType> = {
  record_created: 'record_created',
  record_added: 'record_created',
  add: 'record_created',
  record_updated: 'record_updated',
  record_edited: 'record_updated',
  update: 'record_updated',
  record_deleted: 'record_deleted',
  remove: 'record_deleted',
  delete: 'record_deleted',
}

export const WORKFLOW_EVENT_TYPES: WorkflowEventType[] = ['record_created', 'record_updated', 'record_deleted']

export function normalizeEventType(raw: unknown): WorkflowEventType | null {
  const key = String(raw ?? '')
    .trim()
    .toLowerCase()
  if (!key) return null
  return EVENT_TYPE_ALIASES[key] ?? null
}

export function parseEventTypesFromText(text: string): { eventTypes: WorkflowEventType[]; invalidValues: string[] } {
  const rawValues = String(text || '')
    .split(/[\n,，]/)
    .map((item) => item.trim())
    .filter(Boolean)

  const eventTypes: WorkflowEventType[] = []
  const invalidValues: string[] = []

  for (const rawValue of rawValues) {
    const normalized = normalizeEventType(rawValue)
    if (normalized) {
      if (!eventTypes.includes(normalized)) {
        eventTypes.push(normalized)
      }
      continue
    }
    invalidValues.push(rawValue)
  }

  return { eventTypes, invalidValues }
}

export function parseEventTypesFromConfig(config: Record<string, unknown>): WorkflowEventType[] {
  const rawCandidates: unknown[] = []

  const action = config.action
  const actions = config.actions
  const eventType = config.eventType
  const eventTypes = config.eventTypes

  if (Array.isArray(actions)) rawCandidates.push(...actions)
  else if (actions !== undefined) rawCandidates.push(actions)

  if (Array.isArray(eventTypes)) rawCandidates.push(...eventTypes)
  else if (eventTypes !== undefined) rawCandidates.push(eventTypes)

  if (action !== undefined) rawCandidates.push(action)
  if (eventType !== undefined) rawCandidates.push(eventType)

  const normalizedSet = new Set<WorkflowEventType>()
  rawCandidates.forEach((candidate) => {
    const normalized = normalizeEventType(candidate)
    if (normalized) {
      normalizedSet.add(normalized)
    }
  })

  return Array.from(normalizedSet)
}
