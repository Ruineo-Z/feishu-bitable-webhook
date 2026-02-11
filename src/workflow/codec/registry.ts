import { FieldCodecContext, NormalizedFieldType } from './types'

export interface FieldCodecResolver {
  type: NormalizedFieldType
  matches: (rawFieldType: string) => boolean
}

const TEXT_ALIAS = new Set([
  'text',
  'richtext',
  'rich_text',
  'multiline',
  'multi_line_text',
  'singleline',
  'single_line_text',
  'singlelinetext',
  'barcode',
  'auto_number',
  'phone',
  'email',
  '13',
  '1005',
  '1',
])

const NUMBER_ALIAS = new Set([
  'number',
  'progress',
  'currency',
  'rating',
  '2',
])

const SINGLE_SELECT_ALIAS = new Set([
  'single_select',
  'singleselect',
  'option',
  '3',
])

const MULTI_SELECT_ALIAS = new Set([
  'multi_select',
  'multiselect',
  'options',
  '4',
])

const DATE_ALIAS = new Set([
  'date',
  'datetime',
  'created_time',
  'modified_time',
  'createdtime',
  'modifiedtime',
  '5',
  '1001',
  '1002',
])

const CHECKBOX_ALIAS = new Set([
  'checkbox',
  'bool',
  'boolean',
  '7',
])

const URL_ALIAS = new Set([
  'url',
  'email',
  'hyperlink',
  '15',
])

const ATTACHMENT_ALIAS = new Set([
  'attachment',
  'attach',
  '17',
])

const LINK_ALIAS = new Set([
  'single_link',
  'singlelink',
  'duplex_link',
  'duplexlink',
  'link_record',
  'record_link',
  '18',
  '21',
])

const LOCATION_ALIAS = new Set([
  'location',
  'geo',
  '22',
])

const GROUP_ALIAS = new Set([
  'group',
  'group_chat',
  'groupchat',
  '23',
])

const FORMULA_ALIAS = new Set([
  'formula',
  'lookup',
  '19',
  '20',
])

const USER_ALIAS = new Set([
  'user',
  'users',
  'person',
  'people',
  'member',
  'collaborator',
  'personnel',
  'created_user',
  'modified_user',
  'createduser',
  'modifieduser',
  '11',
  '1003',
  '1004',
])

const RESOLVERS: FieldCodecResolver[] = [
  {
    type: 'text',
    matches: (raw) => TEXT_ALIAS.has(raw),
  },
  {
    type: 'number',
    matches: (raw) => NUMBER_ALIAS.has(raw),
  },
  {
    type: 'single_select',
    matches: (raw) => SINGLE_SELECT_ALIAS.has(raw),
  },
  {
    type: 'multi_select',
    matches: (raw) => MULTI_SELECT_ALIAS.has(raw),
  },
  {
    type: 'date',
    matches: (raw) => DATE_ALIAS.has(raw),
  },
  {
    type: 'checkbox',
    matches: (raw) => CHECKBOX_ALIAS.has(raw),
  },
  {
    type: 'user',
    matches: (raw) => USER_ALIAS.has(raw),
  },
  {
    type: 'url',
    matches: (raw) => URL_ALIAS.has(raw),
  },
  {
    type: 'attachment',
    matches: (raw) => ATTACHMENT_ALIAS.has(raw),
  },
  {
    type: 'link',
    matches: (raw) => LINK_ALIAS.has(raw),
  },
  {
    type: 'location',
    matches: (raw) => LOCATION_ALIAS.has(raw),
  },
  {
    type: 'group',
    matches: (raw) => GROUP_ALIAS.has(raw),
  },
  {
    type: 'formula',
    matches: (raw) => FORMULA_ALIAS.has(raw),
  },
]

function toRawFieldType(rawFieldType: string | null | undefined): string {
  return String(rawFieldType || '').trim().toLowerCase()
}

export function normalizeFieldType(rawFieldType: string | null | undefined): NormalizedFieldType {
  const raw = toRawFieldType(rawFieldType)
  if (!raw) return 'unknown'

  for (const resolver of RESOLVERS) {
    if (resolver.matches(raw)) {
      return resolver.type
    }
  }

  return 'unknown'
}

export function buildFallbackWarning(context: FieldCodecContext) {
  return {
    code: 'FIELD_CODEC_FALLBACK' as const,
    message: `字段 ${context.fieldName} 类型 ${context.rawFieldType || 'unknown'} 未命中 codec，已降级透传`,
    field: context.fieldName,
    fieldType: context.rawFieldType || 'unknown',
  }
}
