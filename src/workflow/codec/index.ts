import { buildFallbackWarning, normalizeFieldType } from './registry'
import {
  CodecTransformResult,
  CodecWarning,
  FieldCodecContext,
  FieldCodecError,
  NormalizedFieldType,
} from './types'

type FilterOperator =
  | 'is'
  | 'isNot'
  | 'contains'
  | 'doesNotContain'
  | 'isEmpty'
  | 'isNotEmpty'
  | 'isGreater'
  | 'isGreaterEqual'
  | 'isLess'
  | 'isLessEqual'
  | 'like'
  | 'in'

const ALL_FILTER_OPERATORS = new Set<FilterOperator>([
  'is',
  'isNot',
  'contains',
  'doesNotContain',
  'isEmpty',
  'isNotEmpty',
  'isGreater',
  'isGreaterEqual',
  'isLess',
  'isLessEqual',
  'like',
  'in',
])

const UNSUPPORTED_FILTER_OPERATORS = new Set<FilterOperator>(['like', 'in'])
const EMPTY_FILTER_OPERATORS = new Set<FilterOperator>(['isEmpty', 'isNotEmpty'])
const DATE_FILTER_KEYWORDS = new Set([
  'ExactDate',
  'Today',
  'Tomorrow',
  'Yesterday',
  'CurrentWeek',
  'LastWeek',
  'CurrentMonth',
  'LastMonth',
  'TheLastWeek',
  'TheNextWeek',
  'TheLastMonth',
  'TheNextMonth',
])

const TEXT_FILTER_OPERATORS = new Set<FilterOperator>([
  'is',
  'isNot',
  'contains',
  'doesNotContain',
  'isEmpty',
  'isNotEmpty',
])

const NUMBER_FILTER_OPERATORS = new Set<FilterOperator>([
  'is',
  'isNot',
  'isEmpty',
  'isNotEmpty',
  'isGreater',
  'isGreaterEqual',
  'isLess',
  'isLessEqual',
])

const DATE_FILTER_OPERATORS = new Set<FilterOperator>([
  'is',
  'isEmpty',
  'isNotEmpty',
  'isGreater',
  'isLess',
])

const CHECKBOX_FILTER_OPERATORS = new Set<FilterOperator>(['is'])
const ATTACHMENT_FILTER_OPERATORS = new Set<FilterOperator>(['isEmpty', 'isNotEmpty'])

const FILTER_OPERATOR_RULES: Partial<Record<NormalizedFieldType, ReadonlySet<FilterOperator>>> = {
  text: TEXT_FILTER_OPERATORS,
  number: NUMBER_FILTER_OPERATORS,
  single_select: TEXT_FILTER_OPERATORS,
  multi_select: TEXT_FILTER_OPERATORS,
  date: DATE_FILTER_OPERATORS,
  checkbox: CHECKBOX_FILTER_OPERATORS,
  user: TEXT_FILTER_OPERATORS,
  url: TEXT_FILTER_OPERATORS,
  attachment: ATTACHMENT_FILTER_OPERATORS,
  link: TEXT_FILTER_OPERATORS,
  location: TEXT_FILTER_OPERATORS,
  group: TEXT_FILTER_OPERATORS,
}

const SINGLE_VALUE_FILTER_TYPES = new Set<NormalizedFieldType>([
  'text',
  'number',
  'checkbox',
  'url',
  'location',
])

function isFilterOperator(operator: string): operator is FilterOperator {
  return ALL_FILTER_OPERATORS.has(operator as FilterOperator)
}

function isNil(value: unknown): value is null | undefined {
  return value === null || value === undefined
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isEmptyFilterOperator(operator: FilterOperator): boolean {
  return EMPTY_FILTER_OPERATORS.has(operator)
}

function stringifyScalar(value: unknown): string {
  if (isNil(value)) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  return JSON.stringify(value)
}

function flattenToArray(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenToArray(item))
  }
  return [value]
}

function hasUnresolvedTemplate(value: unknown): boolean {
  if (typeof value === 'string') {
    return /\$\{[^}]+\}/.test(value)
  }

  if (Array.isArray(value)) {
    return value.some((item) => hasUnresolvedTemplate(item))
  }

  if (isObject(value)) {
    return Object.values(value).some((item) => hasUnresolvedTemplate(item))
  }

  return false
}

function parseNumberValue(value: unknown): number | null {
  if (isNil(value) || value === '') return null

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const normalized = value.trim()
    if (!normalized) return null
    const parsed = Number(normalized)
    return Number.isFinite(parsed) ? parsed : null
  }

  if (isObject(value)) {
    if ('value' in value) {
      return parseNumberValue(value.value)
    }

    const keys = ['number', 'amount', 'progress', 'score']
    for (const key of keys) {
      if (key in value) {
        return parseNumberValue(value[key])
      }
    }
  }

  return null
}

function parseBooleanValue(value: unknown): boolean | null {
  if (isNil(value) || value === '') return null
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (value === 1) return true
    if (value === 0) return false
    return null
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (!normalized) return null
    if (normalized === 'true' || normalized === '1') return true
    if (normalized === 'false' || normalized === '0') return false
  }

  if (isObject(value) && 'value' in value) {
    return parseBooleanValue(value.value)
  }

  return null
}

function extractTextValue(value: unknown): string {
  if (isNil(value)) return ''

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  if (Array.isArray(value)) {
    return value.map((item) => extractTextValue(item)).join('')
  }

  if (isObject(value)) {
    if (typeof value.text === 'string' || typeof value.text === 'number') {
      return String(value.text)
    }
    if (typeof value.link === 'string') {
      return value.link
    }
    if (typeof value.name === 'string') {
      return value.name
    }
    if (typeof value.value === 'string' || typeof value.value === 'number' || typeof value.value === 'boolean') {
      return String(value.value)
    }
  }

  return stringifyScalar(value)
}

function extractTextList(value: unknown): string[] {
  const list = flattenToArray(value)
    .map((item) => extractTextValue(item).trim())
    .filter((item) => item.length > 0)

  return Array.from(new Set(list))
}

function extractUserIds(value: unknown): string[] {
  if (isNil(value)) return []

  const collected: string[] = []
  const values = flattenToArray(value)

  for (const item of values) {
    if (isNil(item)) continue

    if (typeof item === 'string' || typeof item === 'number') {
      const normalized = String(item).trim()
      if (normalized) {
        collected.push(normalized)
      }
      continue
    }

    if (!isObject(item)) continue

    const users = item.users
    if (Array.isArray(users)) {
      for (const user of users) {
        if (!isObject(user)) continue
        const nestedUserId = isObject(user.user_id) ? user.user_id : undefined
        const id =
          (typeof user.id === 'string' && user.id) ||
          (typeof user.open_id === 'string' && user.open_id) ||
          (typeof user.user_id === 'string' && user.user_id) ||
          (nestedUserId && typeof nestedUserId.open_id === 'string' && nestedUserId.open_id) ||
          (nestedUserId && typeof nestedUserId.user_id === 'string' && nestedUserId.user_id) ||
          (nestedUserId && typeof nestedUserId.union_id === 'string' && nestedUserId.union_id)
        if (id) {
          collected.push(id)
        }
      }
      continue
    }

    const id =
      (typeof item.id === 'string' && item.id) ||
      (typeof item.open_id === 'string' && item.open_id) ||
      (typeof item.user_id === 'string' && item.user_id) ||
      (typeof item.userId === 'string' && item.userId)
    if (id) {
      collected.push(id)
    }
  }

  return Array.from(new Set(collected))
}

function extractGroupIds(value: unknown): string[] {
  if (isNil(value)) return []

  const collected: string[] = []
  for (const item of flattenToArray(value)) {
    if (isNil(item)) continue

    if (typeof item === 'string' || typeof item === 'number') {
      const normalized = String(item).trim()
      if (normalized) {
        collected.push(normalized)
      }
      continue
    }

    if (!isObject(item)) continue
    const id =
      (typeof item.id === 'string' && item.id) ||
      (typeof item.chat_id === 'string' && item.chat_id) ||
      (typeof item.open_chat_id === 'string' && item.open_chat_id)
    if (id) {
      collected.push(id)
    }
  }

  return Array.from(new Set(collected))
}

function extractOptionValues(value: unknown): string[] {
  if (isNil(value)) return []

  const collected: string[] = []
  for (const item of flattenToArray(value)) {
    const text = extractTextValue(item).trim()
    if (text) {
      collected.push(text)
    }
  }

  return Array.from(new Set(collected))
}

function parseDateTimestamp(value: unknown): number | null {
  if (isNil(value) || value === '') return null

  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value)
  }

  if (typeof value === 'string') {
    const normalized = value.trim()
    if (!normalized) return null
    if (/^\d+$/.test(normalized)) {
      const parsed = Number(normalized)
      return Number.isFinite(parsed) ? Math.trunc(parsed) : null
    }
    const parsedDate = Date.parse(normalized)
    return Number.isNaN(parsedDate) ? null : parsedDate
  }

  if (isObject(value)) {
    if ('value' in value) {
      return parseDateTimestamp(value.value)
    }
    if (typeof value.timestamp === 'number') return Math.trunc(value.timestamp)
    if (typeof value.time === 'number') return Math.trunc(value.time)
    if (typeof value.date === 'string') {
      const parsedDate = Date.parse(value.date)
      return Number.isNaN(parsedDate) ? null : parsedDate
    }
  }

  return null
}

function extractUrlValue(value: unknown): { text: string; link: string } | null {
  if (isNil(value) || value === '') return null

  if (Array.isArray(value)) {
    for (const item of value) {
      const parsed = extractUrlValue(item)
      if (parsed) return parsed
    }
    return null
  }

  if (isObject(value)) {
    const link =
      (typeof value.link === 'string' && value.link.trim()) ||
      (typeof value.url === 'string' && value.url.trim()) ||
      (typeof value.href === 'string' && value.href.trim()) ||
      ''
    const text =
      (typeof value.text === 'string' && value.text.trim()) ||
      (typeof value.name === 'string' && value.name.trim()) ||
      (typeof value.title === 'string' && value.title.trim()) ||
      ''

    if (!link && !text) return null
    return {
      text: text || link,
      link: link || text,
    }
  }

  const normalized = String(value).trim()
  if (!normalized) return null
  if (normalized.includes('@') && !normalized.startsWith('http')) {
    return {
      text: normalized,
      link: `mailto:${normalized}`,
    }
  }

  return {
    text: normalized,
    link: normalized,
  }
}

function extractAttachmentTokens(value: unknown): string[] {
  if (isNil(value)) return []

  const collected: string[] = []
  for (const item of flattenToArray(value)) {
    if (isNil(item)) continue

    if (typeof item === 'string' || typeof item === 'number') {
      const token = String(item).trim()
      if (token) {
        collected.push(token)
      }
      continue
    }

    if (!isObject(item)) continue
    const token =
      (typeof item.file_token === 'string' && item.file_token) ||
      (typeof item.token === 'string' && item.token) ||
      (typeof item.id === 'string' && item.id)
    if (token) {
      collected.push(token)
    }
  }

  return Array.from(new Set(collected))
}

function decodeAttachmentValue(value: unknown): Array<{ file_token: string; name?: string; type?: string; size?: number; url?: string; tmp_url?: string }> {
  if (isNil(value)) return []
  if (!Array.isArray(value)) {
    const tokens = extractAttachmentTokens(value)
    return tokens.map((token) => ({ file_token: token }))
  }

  const decoded: Array<{ file_token: string; name?: string; type?: string; size?: number; url?: string; tmp_url?: string }> = []
  for (const item of value) {
    if (typeof item === 'string' || typeof item === 'number') {
      decoded.push({ file_token: String(item) })
      continue
    }
    if (!isObject(item)) continue

    const token =
      (typeof item.file_token === 'string' && item.file_token) ||
      (typeof item.token === 'string' && item.token) ||
      (typeof item.id === 'string' && item.id)
    if (!token) continue

    decoded.push({
      file_token: token,
      name: typeof item.name === 'string' ? item.name : undefined,
      type: typeof item.type === 'string' ? item.type : undefined,
      size: typeof item.size === 'number' ? item.size : undefined,
      url: typeof item.url === 'string' ? item.url : undefined,
      tmp_url: typeof item.tmp_url === 'string' ? item.tmp_url : undefined,
    })
  }

  return decoded
}

function extractLinkRecordIds(value: unknown): string[] {
  if (isNil(value)) return []

  const collected: string[] = []

  if (isObject(value) && Array.isArray(value.link_record_ids)) {
    for (const item of value.link_record_ids) {
      if (typeof item === 'string' && item.trim()) {
        collected.push(item.trim())
      }
    }
    return Array.from(new Set(collected))
  }

  for (const item of flattenToArray(value)) {
    if (isNil(item)) continue

    if (typeof item === 'string' || typeof item === 'number') {
      const normalized = String(item).trim()
      if (normalized) {
        collected.push(normalized)
      }
      continue
    }

    if (!isObject(item)) continue

    const id =
      (typeof item.record_id === 'string' && item.record_id) ||
      (typeof item.recordId === 'string' && item.recordId) ||
      (typeof item.id === 'string' && item.id)
    if (id) {
      collected.push(id)
    }
  }

  return Array.from(new Set(collected))
}

function extractLocationText(value: unknown): string {
  if (isNil(value)) return ''
  if (typeof value === 'string') return value

  if (isObject(value)) {
    if (typeof value.location === 'string' && value.location.trim()) return value.location
    if (typeof value.full_address === 'string' && value.full_address.trim()) return value.full_address
    if (typeof value.address === 'string' && value.address.trim()) return value.address
    if (typeof value.name === 'string' && value.name.trim()) return value.name

    const longitude =
      (typeof value.longitude === 'number' && value.longitude) ||
      (typeof value.lng === 'number' && value.lng)
    const latitude =
      (typeof value.latitude === 'number' && value.latitude) ||
      (typeof value.lat === 'number' && value.lat)

    if (typeof longitude === 'number' && typeof latitude === 'number') {
      return `${longitude},${latitude}`
    }
  }

  return extractTextValue(value)
}

function ensureUserIds(
  ids: string[],
  rawValue: unknown,
  context: FieldCodecContext,
): string[] {
  if (ids.length > 0 || isNil(rawValue) || rawValue === '') {
    return ids
  }

  throw new FieldCodecError(
    `字段 ${context.fieldName} 无法转换为人员字段格式`,
    {
      field: context.fieldName,
      field_type: context.rawFieldType || 'user',
      expected_shape: '[{"id":"ou_xxx"}]',
      input_summary: summarizeInputValue(rawValue),
      direction: context.direction,
      operator: context.operator,
    },
  )
}

function throwFieldShapeError(
  context: FieldCodecContext,
  expectedShape: string,
  value: unknown,
): never {
  throw new FieldCodecError(
    `字段 ${context.fieldName} 无法转换为 ${expectedShape}`,
    {
      field: context.fieldName,
      field_type: context.rawFieldType || 'unknown',
      expected_shape: expectedShape,
      input_summary: summarizeInputValue(value),
      direction: context.direction,
      operator: context.operator,
    },
  )
}

function throwFilterOperatorError(
  context: FieldCodecContext,
  normalizedFieldType: NormalizedFieldType,
  operator: string,
  supportedOperators?: ReadonlySet<FilterOperator>,
): never {
  const expected = supportedOperators && supportedOperators.size > 0
    ? `支持操作符: ${Array.from(supportedOperators).join(', ')}`
    : '该字段类型不支持作为筛选条件'

  throw new FieldCodecError(
    `字段 ${context.fieldName} 不支持过滤操作符 ${operator}`,
    {
      field: context.fieldName,
      field_type: context.rawFieldType || normalizedFieldType,
      expected_shape: expected,
      input_summary: operator,
      direction: context.direction,
      operator: context.operator,
    },
  )
}

function assertFilterOperator(
  context: FieldCodecContext,
  normalizedFieldType: NormalizedFieldType,
): FilterOperator {
  const operator = context.operator
  if (!operator) {
    throw new FieldCodecError(
      `字段 ${context.fieldName} 缺少过滤操作符`,
      {
        field: context.fieldName,
        field_type: context.rawFieldType || normalizedFieldType,
        expected_shape: 'filter.conditions[].operator 必填',
        input_summary: 'undefined',
        direction: context.direction,
      },
    )
  }

  if (!isFilterOperator(operator)) {
    throwFilterOperatorError(context, normalizedFieldType, operator, ALL_FILTER_OPERATORS)
  }

  if (UNSUPPORTED_FILTER_OPERATORS.has(operator)) {
    throw new FieldCodecError(
      `字段 ${context.fieldName} 过滤操作符 ${operator} 暂不支持`,
      {
        field: context.fieldName,
        field_type: context.rawFieldType || normalizedFieldType,
        expected_shape: 'Feishu records search 暂不支持 like/in',
        input_summary: operator,
        direction: context.direction,
        operator,
      },
    )
  }

  if (normalizedFieldType === 'formula') {
    throw new FieldCodecError(
      `字段 ${context.fieldName} 类型不支持筛选`,
      {
        field: context.fieldName,
        field_type: context.rawFieldType || normalizedFieldType,
        expected_shape: '公式/查找引用字段不支持作为筛选条件',
        input_summary: operator,
        direction: context.direction,
        operator,
      },
    )
  }

  const supportedOperators = FILTER_OPERATOR_RULES[normalizedFieldType]
  if (supportedOperators && !supportedOperators.has(operator)) {
    throwFilterOperatorError(context, normalizedFieldType, operator, supportedOperators)
  }

  return operator
}

function ensureFilterValueCardinality(
  value: string[] | undefined,
  operator: FilterOperator,
  normalizedFieldType: NormalizedFieldType,
  context: FieldCodecContext,
): string[] | undefined {
  if (!value || value.length === 0) return value

  if (SINGLE_VALUE_FILTER_TYPES.has(normalizedFieldType) && value.length > 1) {
    throwFieldShapeError(context, '单值数组，例如 ["xxx"]', value)
  }

  if (
    (normalizedFieldType === 'single_select' ||
      normalizedFieldType === 'multi_select' ||
      normalizedFieldType === 'user' ||
      normalizedFieldType === 'link' ||
      normalizedFieldType === 'group') &&
    (operator === 'is' || operator === 'isNot') &&
    value.length !== 1
  ) {
    throwFieldShapeError(context, 'operator 为 is/isNot 时 value 需为单值数组', value)
  }

  return value
}

function normalizeDateFilterValue(
  value: unknown,
  context: FieldCodecContext,
): string[] | undefined {
  if (isNil(value) || value === '') return undefined

  if (Array.isArray(value)) {
    const asStrings = value.map((item) => stringifyScalar(item)).filter((item) => item !== '')
    if (asStrings.length === 0) return undefined
    const keyword = asStrings[0]
    if (keyword === 'ExactDate') {
      if (asStrings.length < 2) {
        throwFieldShapeError(context, '["ExactDate","1702449755000"]', value)
      }
      const parsedExactDate = parseDateTimestamp(asStrings[1])
      if (parsedExactDate === null) {
        throwFieldShapeError(context, '["ExactDate","1702449755000"]', value)
      }
      return ['ExactDate', String(parsedExactDate)]
    }
    if (DATE_FILTER_KEYWORDS.has(keyword)) {
      return [keyword]
    }
  }

  if (typeof value === 'string') {
    const keyword = value.trim()
    if (DATE_FILTER_KEYWORDS.has(keyword)) {
      if (keyword === 'ExactDate') {
        throwFieldShapeError(context, '["ExactDate","1702449755000"]', value)
      }
      return [keyword]
    }
  }

  const timestamp = parseDateTimestamp(value)
  if (timestamp === null) {
    throwFieldShapeError(context, '["ExactDate","1702449755000"]', value)
  }

  return ['ExactDate', String(timestamp)]
}

export function summarizeInputValue(value: unknown): string {
  if (isNil(value)) return 'null'
  if (typeof value === 'string') return value.length > 80 ? `${value.slice(0, 80)}...` : value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return `array(len=${value.length})`
  if (typeof value === 'object') return `object(keys=${Object.keys(value as Record<string, unknown>).join(',')})`
  return typeof value
}

export function formatCodecWarnings(warnings: CodecWarning[]) {
  return warnings.map((warning) => ({
    code: warning.code,
    field: warning.field,
    fieldType: warning.fieldType,
    message: warning.message,
  }))
}

function asCodecResult<T>(
  value: T,
  normalizedFieldType: CodecTransformResult['normalizedFieldType'],
  warnings: CodecWarning[] = [],
): CodecTransformResult<T> {
  return {
    value,
    normalizedFieldType,
    warnings,
  }
}

export function decodeFieldValue(
  value: unknown,
  context: Omit<FieldCodecContext, 'direction'>,
): CodecTransformResult {
  const codecContext: FieldCodecContext = {
    ...context,
    direction: 'decode',
  }

  const normalized = normalizeFieldType(codecContext.rawFieldType || null)

  switch (normalized) {
    case 'text':
      return asCodecResult(extractTextValue(value), normalized)
    case 'number': {
      const parsed = parseNumberValue(value)
      if (parsed !== null || isNil(value) || value === '') {
        return asCodecResult(parsed, normalized)
      }
      return asCodecResult(value, normalized, [buildFallbackWarning(codecContext)])
    }
    case 'single_select': {
      const options = extractOptionValues(value)
      return asCodecResult(options[0] || '', normalized)
    }
    case 'multi_select':
      return asCodecResult(extractOptionValues(value), normalized)
    case 'date': {
      const parsed = parseDateTimestamp(value)
      if (parsed !== null || isNil(value) || value === '') {
        return asCodecResult(parsed, normalized)
      }
      return asCodecResult(value, normalized, [buildFallbackWarning(codecContext)])
    }
    case 'checkbox': {
      const parsed = parseBooleanValue(value)
      if (parsed !== null || isNil(value) || value === '') {
        return asCodecResult(parsed, normalized)
      }
      return asCodecResult(value, normalized, [buildFallbackWarning(codecContext)])
    }
    case 'user': {
      const ids = extractUserIds(value).map((id) => ({ id }))
      return asCodecResult(ids, normalized)
    }
    case 'url':
      return asCodecResult(extractUrlValue(value), normalized)
    case 'attachment':
      return asCodecResult(decodeAttachmentValue(value), normalized)
    case 'link':
      return asCodecResult(extractLinkRecordIds(value), normalized)
    case 'location':
      return asCodecResult(extractLocationText(value), normalized)
    case 'group': {
      const ids = extractGroupIds(value).map((id) => ({ id }))
      return asCodecResult(ids, normalized)
    }
    case 'formula':
      return asCodecResult(isObject(value) && 'value' in value ? value.value : value, normalized)
    default:
      return asCodecResult(value, normalized, [buildFallbackWarning(codecContext)])
  }
}

export function encodeFieldValueForWrite(
  value: unknown,
  context: Omit<FieldCodecContext, 'direction'>,
): CodecTransformResult {
  const codecContext: FieldCodecContext = {
    ...context,
    direction: 'write',
  }

  const normalized = normalizeFieldType(codecContext.rawFieldType || null)

  switch (normalized) {
    case 'text':
      return asCodecResult(extractTextValue(value), normalized)
    case 'number': {
      const parsed = parseNumberValue(value)
      if (parsed === null && !isNil(value) && value !== '') {
        throwFieldShapeError(codecContext, 'number', value)
      }
      return asCodecResult(parsed, normalized)
    }
    case 'single_select': {
      const options = extractOptionValues(value)
      return asCodecResult(options[0] || null, normalized)
    }
    case 'multi_select':
      return asCodecResult(extractOptionValues(value), normalized)
    case 'date': {
      const parsed = parseDateTimestamp(value)
      if (parsed === null && !isNil(value) && value !== '') {
        throwFieldShapeError(codecContext, 'timestamp(number, ms)', value)
      }
      return asCodecResult(parsed, normalized)
    }
    case 'checkbox': {
      const parsed = parseBooleanValue(value)
      if (parsed === null && !isNil(value) && value !== '') {
        throwFieldShapeError(codecContext, 'boolean', value)
      }
      return asCodecResult(parsed, normalized)
    }
    case 'user': {
      const ids = ensureUserIds(extractUserIds(value), value, codecContext)
      if (ids.length === 0) {
        return asCodecResult(null, normalized)
      }
      return asCodecResult(ids.map((id) => ({ id })), normalized)
    }
    case 'url': {
      const parsed = extractUrlValue(value)
      if (!parsed) {
        return asCodecResult(null, normalized)
      }
      if (!parsed.link) {
        throwFieldShapeError(codecContext, '{"text":"xxx","link":"https://..."}', value)
      }
      return asCodecResult(parsed, normalized)
    }
    case 'attachment': {
      const tokens = extractAttachmentTokens(value)
      if (tokens.length === 0) return asCodecResult(null, normalized)
      return asCodecResult(tokens.map((token) => ({ file_token: token })), normalized)
    }
    case 'link': {
      const recordIds = extractLinkRecordIds(value)
      if (recordIds.length === 0) return asCodecResult(null, normalized)
      return asCodecResult(recordIds, normalized)
    }
    case 'location': {
      const location = extractLocationText(value).trim()
      if (!location) return asCodecResult(null, normalized)
      return asCodecResult(location, normalized)
    }
    case 'group': {
      const ids = extractGroupIds(value)
      if (ids.length === 0) return asCodecResult(null, normalized)
      return asCodecResult(ids.map((id) => ({ id })), normalized)
    }
    case 'formula':
      return asCodecResult(value, normalized)
    default:
      return asCodecResult(value, normalized, [buildFallbackWarning(codecContext)])
  }
}

export function encodeFieldValueForFilter(
  value: unknown,
  context: Omit<FieldCodecContext, 'direction'>,
): CodecTransformResult<string[] | undefined> {
  const codecContext: FieldCodecContext = {
    ...context,
    direction: 'filter',
  }

  const normalized = normalizeFieldType(codecContext.rawFieldType || null)
  const operator = assertFilterOperator(codecContext, normalized)

  if (isEmptyFilterOperator(operator)) {
    return asCodecResult([], normalized)
  }

  if (isNil(value) || value === '') {
    return asCodecResult(undefined, normalized)
  }

  if (hasUnresolvedTemplate(value)) {
    throw new FieldCodecError(
      `字段 ${codecContext.fieldName} 存在未解析的模板变量`,
      {
        field: codecContext.fieldName,
        field_type: codecContext.rawFieldType || normalized,
        expected_shape: '请检查 ${...} 路径是否存在且可访问',
        input_summary: summarizeInputValue(value),
        direction: codecContext.direction,
        operator,
      },
    )
  }

  switch (normalized) {
    case 'text': {
      const converted = extractTextList(value)
      return asCodecResult(
        ensureFilterValueCardinality(
          converted.length > 0 ? converted : undefined,
          operator,
          normalized,
          codecContext,
        ),
        normalized,
      )
    }
    case 'number': {
      const parsed = parseNumberValue(value)
      if (parsed === null) {
        throwFieldShapeError(codecContext, '["100"]', value)
      }
      return asCodecResult(
        ensureFilterValueCardinality([String(parsed)], operator, normalized, codecContext),
        normalized,
      )
    }
    case 'single_select': {
      const options = extractOptionValues(value)
      if (options.length === 0) {
        return asCodecResult(undefined, normalized)
      }
      return asCodecResult(
        ensureFilterValueCardinality(options, operator, normalized, codecContext),
        normalized,
      )
    }
    case 'multi_select': {
      const options = extractOptionValues(value)
      return asCodecResult(
        ensureFilterValueCardinality(
          options.length > 0 ? options : undefined,
          operator,
          normalized,
          codecContext,
        ),
        normalized,
      )
    }
    case 'date': {
      const converted = normalizeDateFilterValue(value, codecContext)
      return asCodecResult(
        ensureFilterValueCardinality(converted, operator, normalized, codecContext),
        normalized,
      )
    }
    case 'checkbox': {
      const parsed = parseBooleanValue(value)
      if (parsed === null) {
        throwFieldShapeError(codecContext, '["true"] | ["false"]', value)
      }
      return asCodecResult(
        ensureFilterValueCardinality([String(parsed)], operator, normalized, codecContext),
        normalized,
      )
    }
    case 'user': {
      const ids = ensureUserIds(extractUserIds(value), value, codecContext)
      return asCodecResult(
        ensureFilterValueCardinality(ids.length > 0 ? ids : undefined, operator, normalized, codecContext),
        normalized,
      )
    }
    case 'url': {
      const parsed = extractUrlValue(value)
      if (!parsed) return asCodecResult(undefined, normalized)
      const target = parsed.text || parsed.link
      return asCodecResult(
        ensureFilterValueCardinality(target ? [target] : undefined, operator, normalized, codecContext),
        normalized,
      )
    }
    case 'attachment':
      throwFieldShapeError(codecContext, '[] (only for isEmpty/isNotEmpty)', value)
    case 'link': {
      const recordIds = extractLinkRecordIds(value)
      return asCodecResult(
        ensureFilterValueCardinality(
          recordIds.length > 0 ? recordIds : undefined,
          operator,
          normalized,
          codecContext,
        ),
        normalized,
      )
    }
    case 'location': {
      const target = extractLocationText(value).trim()
      return asCodecResult(
        ensureFilterValueCardinality(target ? [target] : undefined, operator, normalized, codecContext),
        normalized,
      )
    }
    case 'group': {
      const ids = extractGroupIds(value)
      return asCodecResult(
        ensureFilterValueCardinality(
          ids.length > 0 ? ids : undefined,
          operator,
          normalized,
          codecContext,
        ),
        normalized,
      )
    }
    case 'formula': {
      throw new FieldCodecError(
        `字段 ${codecContext.fieldName} 类型不支持筛选`,
        {
          field: codecContext.fieldName,
          field_type: codecContext.rawFieldType || 'formula',
          expected_shape: '公式/查找引用字段不支持作为筛选条件',
          input_summary: summarizeInputValue(value),
          direction: codecContext.direction,
          operator,
        },
      )
    }
    default: {
      const inferredUserIds = extractUserIds(value)
      const inferredGroupIds = inferredUserIds.length === 0 ? extractGroupIds(value) : []
      const inferredRecordIds = (inferredUserIds.length === 0 && inferredGroupIds.length === 0)
        ? extractLinkRecordIds(value)
        : []
      const inferredText = (inferredUserIds.length === 0 && inferredGroupIds.length === 0 && inferredRecordIds.length === 0)
        ? extractTextList(value)
        : []

      const fallback = inferredUserIds.length > 0
        ? inferredUserIds
        : inferredGroupIds.length > 0
          ? inferredGroupIds
          : inferredRecordIds.length > 0
            ? inferredRecordIds
            : inferredText.length > 0
              ? inferredText
              : (Array.isArray(value)
                ? value.map((item) => stringifyScalar(item)).filter((item) => item !== '')
                : [stringifyScalar(value)].filter((item) => item !== ''))

      return asCodecResult(
        ensureFilterValueCardinality(
          fallback.length > 0 ? fallback : undefined,
          operator,
          normalized,
          codecContext,
        ),
        normalized,
        [buildFallbackWarning(codecContext)],
      )
    }
  }
}

export { FieldCodecError }
export type { CodecWarning } from './types'
