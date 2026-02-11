import type { FormModel } from '../types/workflow'

const FILTER_OPERATOR_OPTIONS = [
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
] as const

const EMPTY_VALUE_OPERATORS = new Set<string>(['isEmpty', 'isNotEmpty'])

type StepFormModel = FormModel['steps'][number]

type CreateDraft = {
  appToken: string
  tableId: string
  fields: Array<{ key: string; valueText: string }>
}

type DeleteDraft = {
  appToken: string
  tableId: string
  mode: 'record' | 'filter'
  recordId: string
  conjunction: 'and' | 'or'
  condition: {
    fieldName: string
    operator: string
    valueText: string
  }
  unsupportedMultiCondition: boolean
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  return value as Record<string, unknown>
}

function parseConfigObject(configText: string): Record<string, unknown> | null {
  const trimmed = configText.trim()
  if (!trimmed) return {}

  try {
    return asObject(JSON.parse(trimmed))
  } catch {
    return null
  }
}

function toInputValue(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)

  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function parseLooseValue(raw: string): unknown {
  const trimmed = raw.trim()

  if (!trimmed) return ''
  if (/^(true|false|null)$/i.test(trimmed)) return JSON.parse(trimmed.toLowerCase())
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed)

  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      return JSON.parse(trimmed)
    } catch {
      return raw
    }
  }

  return raw
}

function pickNewFieldKey(existingKeys: string[]): string {
  const normalized = new Set(existingKeys.map((key) => key.trim()).filter(Boolean))
  let seed = 1
  while (normalized.has(`字段${seed}`)) {
    seed += 1
  }

  return `字段${seed}`
}

function parseCreateDraft(configText: string): CreateDraft | null {
  const parsed = parseConfigObject(configText)
  if (!parsed) return null

  const appToken = String(parsed.app_token ?? '')
  const tableId = String(parsed.table_id ?? '')

  const fieldsObj = asObject(parsed.fields) || {}
  const fieldEntries = Object.entries(fieldsObj).map(([key, value]) => ({
    key,
    valueText: toInputValue(value),
  }))

  return {
    appToken,
    tableId,
    fields: fieldEntries,
  }
}

function serializeCreateDraft(draft: CreateDraft): string {
  const fields: Record<string, unknown> = {}

  draft.fields.forEach((entry) => {
    const key = entry.key.trim()
    if (!key) return
    fields[key] = parseLooseValue(entry.valueText)
  })

  return JSON.stringify(
    {
      app_token: draft.appToken,
      table_id: draft.tableId,
      fields,
    },
    null,
    2,
  )
}

function parseDeleteDraft(configText: string): DeleteDraft | null {
  const parsed = parseConfigObject(configText)
  if (!parsed) return null

  const appToken = String(parsed.app_token ?? '')
  const tableId = String(parsed.table_id ?? '')
  const recordId = String(parsed.record_id ?? '')

  const filterObj = asObject(parsed.filter)
  const conjunction = String(filterObj?.conjunction ?? 'and').toLowerCase() === 'or' ? 'or' : 'and'
  const conditions = Array.isArray(filterObj?.conditions) ? (filterObj?.conditions as Array<Record<string, unknown>>) : []

  const firstCondition = conditions[0] || {}
  const condition = {
    fieldName: String(firstCondition.field_name ?? ''),
    operator: String(firstCondition.operator ?? 'is') || 'is',
    valueText: toInputValue(firstCondition.value),
  }

  return {
    appToken,
    tableId,
    mode: recordId ? 'record' : 'filter',
    recordId,
    conjunction,
    condition,
    unsupportedMultiCondition: conditions.length > 1,
  }
}

function serializeDeleteDraft(draft: DeleteDraft): string {
  const base: Record<string, unknown> = {
    app_token: draft.appToken,
    table_id: draft.tableId,
  }

  if (draft.mode === 'record') {
    base.record_id = draft.recordId
    return JSON.stringify(base, null, 2)
  }

  const operator = draft.condition.operator || 'is'
  const condition: Record<string, unknown> = {
    field_name: draft.condition.fieldName,
    operator,
  }

  if (!EMPTY_VALUE_OPERATORS.has(operator) && draft.condition.valueText.trim()) {
    condition.value = parseLooseValue(draft.condition.valueText)
  }

  base.filter = {
    conjunction: draft.conjunction,
    conditions: [condition],
  }

  return JSON.stringify(base, null, 2)
}

function GenericJsonEditor(props: {
  configText: string
  onConfigTextChange: (next: string) => void
  disabled?: boolean
}) {
  const { configText, onConfigTextChange, disabled } = props

  return (
    <label>
      step.config（JSON 对象）
      <textarea
        rows={8}
        value={configText}
        onChange={(event) => onConfigTextChange(event.target.value)}
        spellCheck={false}
        disabled={disabled}
      />
    </label>
  )
}

function CreateConfigEditor(props: {
  step: StepFormModel
  onConfigTextChange: (next: string) => void
  disabled?: boolean
}) {
  const { step, onConfigTextChange, disabled } = props
  const draft = parseCreateDraft(step.configText)

  if (!draft) {
    return (
      <div className="step-config-assist">
        <p className="assist-error">当前 config 不是合法 JSON 对象，已切回原始编辑。</p>
        <GenericJsonEditor configText={step.configText} onConfigTextChange={onConfigTextChange} disabled={disabled} />
      </div>
    )
  }

  const updateDraft = (mutator: (source: CreateDraft) => void) => {
    const nextDraft: CreateDraft = {
      appToken: draft.appToken,
      tableId: draft.tableId,
      fields: draft.fields.map((field) => ({ ...field })),
    }

    mutator(nextDraft)
    onConfigTextChange(serializeCreateDraft(nextDraft))
  }

  return (
    <div className="step-config-assist">
      <p className="assist-tip">可视化模式：不用手写 JSON，按业务含义填入创建参数。</p>

      <div className="form-grid three">
        <label>
          目标 app_token
          <input
            type="text"
            value={draft.appToken}
            onChange={(event) => updateDraft((source) => void (source.appToken = event.target.value))}
            placeholder="KaW..."
            disabled={disabled}
          />
        </label>
        <label>
          目标 table_id
          <input
            type="text"
            value={draft.tableId}
            onChange={(event) => updateDraft((source) => void (source.tableId = event.target.value))}
            placeholder="tbl..."
            disabled={disabled}
          />
        </label>
      </div>

      <div className="kv-box">
        <div className="kv-box-head">
          <strong>字段映射（fields）</strong>
          <button
            type="button"
            className="btn btn-subtle"
            onClick={() =>
              updateDraft((source) => {
                const nextKey = pickNewFieldKey(source.fields.map((field) => field.key))
                source.fields.push({ key: nextKey, valueText: '' })
              })
            }
            disabled={disabled}
          >
            + 添加字段
          </button>
        </div>

        {draft.fields.length === 0 ? (
          <p className="assist-tip">暂无字段，先点击“添加字段”。</p>
        ) : (
          <div className="kv-list">
            {draft.fields.map((field, index) => (
              <div className="kv-row" key={`${field.key}-${index}`}>
                <label>
                  字段名
                  <input
                    type="text"
                    value={field.key}
                    onChange={(event) =>
                      updateDraft((source) => {
                        source.fields[index].key = event.target.value
                      })
                    }
                    placeholder="例如：第一负责人"
                    disabled={disabled}
                  />
                </label>

                <label>
                  字段值（支持模板）
                  <input
                    type="text"
                    value={field.valueText}
                    onChange={(event) =>
                      updateDraft((source) => {
                        source.fields[index].valueText = event.target.value
                      })
                    }
                    placeholder="例如：${trigger.record.fields.账号名称}"
                    disabled={disabled}
                  />
                </label>

                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() =>
                    updateDraft((source) => {
                      source.fields.splice(index, 1)
                    })
                  }
                  disabled={disabled}
                >
                  删除
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function DeleteConfigEditor(props: {
  step: StepFormModel
  onConfigTextChange: (next: string) => void
  disabled?: boolean
}) {
  const { step, onConfigTextChange, disabled } = props
  const draft = parseDeleteDraft(step.configText)

  if (!draft) {
    return (
      <div className="step-config-assist">
        <p className="assist-error">当前 config 不是合法 JSON 对象，已切回原始编辑。</p>
        <GenericJsonEditor configText={step.configText} onConfigTextChange={onConfigTextChange} disabled={disabled} />
      </div>
    )
  }

  if (draft.unsupportedMultiCondition) {
    return (
      <div className="step-config-assist">
        <p className="assist-error">检测到多条件 filter。可视化仅支持单条件删除，请在高级 JSON 模式编辑复杂条件。</p>
        <GenericJsonEditor configText={step.configText} onConfigTextChange={onConfigTextChange} disabled={disabled} />
      </div>
    )
  }

  const updateDraft = (mutator: (source: DeleteDraft) => void) => {
    const nextDraft: DeleteDraft = {
      appToken: draft.appToken,
      tableId: draft.tableId,
      mode: draft.mode,
      recordId: draft.recordId,
      conjunction: draft.conjunction,
      condition: { ...draft.condition },
      unsupportedMultiCondition: false,
    }

    mutator(nextDraft)
    onConfigTextChange(serializeDeleteDraft(nextDraft))
  }

  const hideValueInput = EMPTY_VALUE_OPERATORS.has(draft.condition.operator)

  return (
    <div className="step-config-assist">
      <p className="assist-tip">可视化模式：优先按“删除依据”配置，不必直接拼 filter JSON。</p>

      <div className="form-grid three">
        <label>
          目标 app_token
          <input
            type="text"
            value={draft.appToken}
            onChange={(event) => updateDraft((source) => void (source.appToken = event.target.value))}
            placeholder="KaW..."
            disabled={disabled}
          />
        </label>
        <label>
          目标 table_id
          <input
            type="text"
            value={draft.tableId}
            onChange={(event) => updateDraft((source) => void (source.tableId = event.target.value))}
            placeholder="tbl..."
            disabled={disabled}
          />
        </label>
        <label>
          删除依据
          <select
            value={draft.mode}
            onChange={(event) =>
              updateDraft((source) => {
                source.mode = event.target.value === 'record' ? 'record' : 'filter'
              })
            }
            disabled={disabled}
          >
            <option value="filter">按筛选条件删除</option>
            <option value="record">按 record_id 删除</option>
          </select>
        </label>
      </div>

      {draft.mode === 'record' ? (
        <label>
          record_id
          <input
            type="text"
            value={draft.recordId}
            onChange={(event) => updateDraft((source) => void (source.recordId = event.target.value))}
            placeholder="recxxxx"
            disabled={disabled}
          />
        </label>
      ) : (
        <div className="kv-box">
          <div className="form-grid three">
            <label>
              逻辑关系
              <select
                value={draft.conjunction}
                onChange={(event) =>
                  updateDraft((source) => {
                    source.conjunction = event.target.value === 'or' ? 'or' : 'and'
                  })
                }
                disabled={disabled}
              >
                <option value="and">and</option>
                <option value="or">or</option>
              </select>
            </label>
            <label>
              field_name
              <input
                type="text"
                value={draft.condition.fieldName}
                onChange={(event) => updateDraft((source) => void (source.condition.fieldName = event.target.value))}
                placeholder="例如：第一负责人"
                disabled={disabled}
              />
            </label>
            <label>
              operator
              <select
                value={draft.condition.operator}
                onChange={(event) => updateDraft((source) => void (source.condition.operator = event.target.value))}
                disabled={disabled}
              >
                {FILTER_OPERATOR_OPTIONS.map((operator) => (
                  <option key={operator} value={operator}>
                    {operator}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {!hideValueInput ? (
            <label>
              value（支持模板）
              <input
                type="text"
                value={draft.condition.valueText}
                onChange={(event) => updateDraft((source) => void (source.condition.valueText = event.target.value))}
                placeholder="例如：${trigger.record.beforeFields.账号第一负责人.0.id}"
                disabled={disabled}
              />
            </label>
          ) : (
            <p className="assist-tip">当前操作符无需填写 value。</p>
          )}
        </div>
      )}
    </div>
  )
}

export function StepActionConfigEditor(props: {
  step: StepFormModel
  onConfigTextChange: (next: string) => void
  disabled?: boolean
}) {
  const { step, onConfigTextChange, disabled } = props

  if (step.type === 'action.bitable.create') {
    return <CreateConfigEditor step={step} onConfigTextChange={onConfigTextChange} disabled={disabled} />
  }

  if (step.type === 'action.bitable.delete') {
    return <DeleteConfigEditor step={step} onConfigTextChange={onConfigTextChange} disabled={disabled} />
  }

  return <GenericJsonEditor configText={step.configText} onConfigTextChange={onConfigTextChange} disabled={disabled} />
}
