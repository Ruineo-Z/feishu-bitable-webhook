export type FieldCodecDirection = 'decode' | 'write' | 'filter'

export type NormalizedFieldType =
  | 'text'
  | 'number'
  | 'single_select'
  | 'multi_select'
  | 'date'
  | 'checkbox'
  | 'user'
  | 'url'
  | 'attachment'
  | 'link'
  | 'location'
  | 'group'
  | 'formula'
  | 'unknown'

export interface FieldCodecContext {
  appToken: string
  tableId: string
  fieldName: string
  fieldId?: string
  rawFieldType?: string | null
  direction: FieldCodecDirection
  operator?: string
}

export interface CodecWarning {
  code: 'FIELD_CODEC_FALLBACK'
  message: string
  field: string
  fieldType: string
}

export interface CodecTransformResult<T = unknown> {
  value: T
  normalizedFieldType: NormalizedFieldType
  warnings: CodecWarning[]
}

export interface FieldCodecErrorDetails {
  field: string
  field_type: string
  expected_shape: string
  input_summary: string
  direction: FieldCodecDirection
  operator?: string
}

export class FieldCodecError extends Error {
  readonly code = 'FIELD_CODEC_ENCODE_FAILED'
  readonly details: FieldCodecErrorDetails

  constructor(message: string, details: FieldCodecErrorDetails) {
    super(message)
    this.name = 'FieldCodecError'
    this.details = details
  }
}
