import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createWorkflow,
  deleteWorkflow,
  fetchWorkflowDetail,
  fetchWorkflowList,
  toUserFacingError,
  updateWorkflow,
} from './lib/api'
import {
  createDefaultFormModel,
  createDefaultStep,
  decodeConfigToFormModel,
  encodeFormModel,
  parseConfigJson,
  resolveScopeFromConfig,
  serializeConfig,
} from './lib/adapter'
import type {
  AdapterError,
  ConditionFormModel,
  ExpressionFormModel,
  FormModel,
  WorkflowDetail,
  WorkflowSummary,
} from './types/workflow'
import { StepActionConfigEditor } from './components/StepActionConfigEditor'
const THEME_OPTIONS = [
  { value: 'halo', label: 'Halo 金青（默认）' },
  { value: 'aero', label: 'Aero 青蓝' },
  { value: 'quantum', label: 'Quantum 紫青' },
  { value: 'obsidian-lux', label: '黑金·行政奢华' },
  { value: 'obsidian-lab', label: '黑金·未来实验室' },
] as const

const EVENT_TYPE_OPTIONS = [
  { value: 'record_updated', label: '记录更新' },
  { value: 'record_created', label: '记录新增' },
  { value: 'record_deleted', label: '记录删除' },
] as const

const STEP_TYPE_OPTIONS = [
  'condition',
  'action.bitable.delete',
  'action.bitable.create',
  'action.feishu.message',
  'action.custom',
] as const

const CONDITION_OPERATOR_OPTIONS = [
  'changed',
  'equals',
  'notEquals',
  'exists',
  'notExists',
  'contains',
  'doesNotContain',
  'isEmpty',
  'isNotEmpty',
  'greaterThan',
  'lessThan',
] as const


type FeedbackType = 'info' | 'success' | 'error' | 'warning'
type BuilderMode = 'visual' | 'advanced'

type Feedback = {
  type: FeedbackType
  message: string
}

type Pagination = {
  limit: number
  offset: number
  total: number
}

function cloneModel(model: FormModel): FormModel {
  if (typeof structuredClone === 'function') {
    return structuredClone(model)
  }

  return JSON.parse(JSON.stringify(model)) as FormModel
}

function formatDateTime(value: string): string {
  if (!value) return '-'
  const parsedDate = new Date(value)
  if (Number.isNaN(parsedDate.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsedDate)
}

function toScopeText(workflow: WorkflowSummary): string {
  const scope = workflow.scope
  const eventText = scope.eventTypes && scope.eventTypes.length > 0 ? scope.eventTypes.join('/') : 'all-events'
  return `table · ${scope.appToken}/${scope.tableId} · ${eventText}`
}

function summarizeSteps(workflow: WorkflowSummary): string {
  const steps = workflow.config?.steps || []
  if (steps.length === 0) return '无步骤'

  let conditionCount = 0
  let guardCount = 0

  steps.forEach((step) => {
    if (step.type === 'condition') {
      conditionCount += 1
    }

    if (step.when) {
      guardCount += 1
    }
  })

  const tags = [`步骤 ${steps.length}`]
  if (conditionCount > 0) tags.push(`条件 ${conditionCount}`)
  if (guardCount > 0) tags.push(`守卫 ${guardCount}`)
  return tags.join(' · ')
}

function parseEventTypeTokens(text: string): string[] {
  return text
    .split(',')
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
}

function buildProgress(model: FormModel): {
  total: number
  done: number
  doneItems: string[]
  todoItems: string[]
} {
  const checks = [
    { label: '流程已命名', done: model.name.trim().length > 0 },
    { label: '已填写 appToken', done: model.appToken.trim().length > 0 },
    { label: '已填写 tableId', done: model.tableId.trim().length > 0 },
    { label: '至少 1 个步骤', done: model.steps.length > 0 },
    {
      label: '步骤均有类型',
      done: model.steps.length > 0 && model.steps.every((step) => step.type.trim().length > 0),
    },
  ]

  const doneItems = checks.filter((item) => item.done).map((item) => item.label)
  const todoItems = checks.filter((item) => !item.done).map((item) => item.label)

  return {
    total: checks.length,
    done: doneItems.length,
    doneItems,
    todoItems,
  }
}

function ConditionEditor(props: {
  condition: ConditionFormModel
  onLogicChange: (logic: 'AND' | 'OR') => void
  onExpressionChange: (expressionId: string, patch: Partial<ExpressionFormModel>) => void
  onAddExpression: () => void
  onRemoveExpression: (expressionId: string) => void
  disabled?: boolean
}) {
  const { condition, onLogicChange, onExpressionChange, onAddExpression, onRemoveExpression, disabled } = props

  return (
    <div className="condition-editor">
      <div className="condition-head">
        <label>
          逻辑关系
          <select
            value={condition.logic}
            onChange={(event) => onLogicChange(event.target.value === 'OR' ? 'OR' : 'AND')}
            disabled={disabled}
          >
            <option value="AND">AND（都满足）</option>
            <option value="OR">OR（任一满足）</option>
          </select>
        </label>
        <button type="button" className="btn btn-subtle" onClick={onAddExpression} disabled={disabled}>
          + 添加表达式
        </button>
      </div>

      <div className="expression-list">
        {condition.expressions.map((expression) => (
          <div className="expression-row" key={expression.id}>
            <label>
              字段
              <input
                type="text"
                value={expression.field}
                placeholder="例如：账号第一负责人"
                onChange={(event) => onExpressionChange(expression.id, { field: event.target.value })}
                disabled={disabled}
              />
            </label>
            <label>
              操作符
              <select
                value={expression.operator}
                onChange={(event) => onExpressionChange(expression.id, { operator: event.target.value })}
                disabled={disabled}
              >
                {CONDITION_OPERATOR_OPTIONS.map((operator) => (
                  <option key={operator} value={operator}>
                    {operator}
                  </option>
                ))}
                {!CONDITION_OPERATOR_OPTIONS.includes(expression.operator as (typeof CONDITION_OPERATOR_OPTIONS)[number]) ? (
                  <option value={expression.operator}>{expression.operator || '自定义'}</option>
                ) : null}
              </select>
            </label>
            <label>
              比较值
              <input
                type="text"
                value={expression.valueText}
                placeholder="可留空（取决于操作符）"
                onChange={(event) => onExpressionChange(expression.id, { valueText: event.target.value })}
                disabled={disabled}
              />
            </label>
            <label>
              值来源
              <select
                value={expression.source}
                onChange={(event) =>
                  onExpressionChange(expression.id, { source: event.target.value === 'before' ? 'before' : 'after' })
                }
                disabled={disabled}
              >
                <option value="after">after（变更后）</option>
                <option value="before">before（变更前）</option>
              </select>
            </label>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => onRemoveExpression(expression.id)}
              disabled={disabled || condition.expressions.length <= 1}
            >
              删除
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function App() {
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [listError, setListError] = useState('')
  const [feedback, setFeedback] = useState<Feedback>({
    type: 'info',
    message: '欢迎使用工作流管理台，先创建一个流程试试。',
  })

  const [pagination, setPagination] = useState<Pagination>({
    limit: 10,
    offset: 0,
    total: 0,
  })
  const [statusFilter, setStatusFilter] = useState<'all' | 'true' | 'false'>('all')

  const [currentWorkflowId, setCurrentWorkflowId] = useState<string | null>(null)
  const [mode, setMode] = useState<BuilderMode>('visual')
  const [modeWarning, setModeWarning] = useState('')
  const [advancedJson, setAdvancedJson] = useState('')
  const [formModel, setFormModel] = useState<FormModel>(() => createDefaultFormModel())

  const [tone, setTone] = useState<(typeof THEME_OPTIONS)[number]['value']>('halo')
  const [motionReduced, setMotionReduced] = useState(false)
  const [newStepType, setNewStepType] = useState<(typeof STEP_TYPE_OPTIONS)[number]>('condition')

  useEffect(() => {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setMotionReduced(true)
    }
  }, [])

  const currentPage = useMemo(() => Math.floor(pagination.offset / pagination.limit) + 1, [pagination])
  const totalPages = useMemo(() => Math.max(1, Math.ceil(pagination.total / pagination.limit)), [pagination])

  const selectedEventTypes = useMemo(() => new Set(parseEventTypeTokens(formModel.eventTypesText)), [formModel.eventTypesText])
  const draftProgress = useMemo(() => buildProgress(formModel), [formModel])
  const stepIdOptions = useMemo(
    () => formModel.steps.map((step) => step.id.trim()).filter((id) => id.length > 0),
    [formModel.steps],
  )

  const activeWorkflowCount = useMemo(
    () => workflows.filter((workflow) => workflow.is_active).length,
    [workflows],
  )

  const loadWorkflowList = useCallback(async () => {
    setListLoading(true)
    setListError('')

    try {
      const response = await fetchWorkflowList({
        isActive: statusFilter,
        limit: pagination.limit,
        offset: pagination.offset,
      })

      const rows = Array.isArray(response.data) ? response.data : []
      setWorkflows(rows)
      setPagination((previous) => ({
        ...previous,
        total: response.meta?.pagination?.total ?? rows.length,
        limit: response.meta?.pagination?.limit ?? previous.limit,
        offset: response.meta?.pagination?.offset ?? previous.offset,
      }))
    } catch (error) {
      const userError = toUserFacingError(error)
      setWorkflows([])
      setListError(`${userError.message}（${userError.code}）`)
    } finally {
      setListLoading(false)
    }
  }, [pagination.limit, pagination.offset, statusFilter])

  useEffect(() => {
    void loadWorkflowList()
  }, [loadWorkflowList])

  const updateModel = useCallback((mutator: (draft: FormModel) => void) => {
    setFormModel((previous) => {
      const draft = cloneModel(previous)
      mutator(draft)
      return draft
    })
  }, [])

  const resetToCreateMode = useCallback(() => {
    const defaultModel = createDefaultFormModel()
    setCurrentWorkflowId(null)
    setMode('visual')
    setModeWarning('')
    setFormModel(defaultModel)

    try {
      const encoded = encodeFormModel(defaultModel)
      setAdvancedJson(serializeConfig(encoded.config))
    } catch {
      setAdvancedJson('')
    }

    setFeedback({ type: 'info', message: '已切换到新建模式。' })
  }, [])

  const openEditor = useCallback(async (workflowId: string) => {
    setFeedback({ type: 'info', message: '正在加载工作流详情...' })

    try {
      const response = await fetchWorkflowDetail(workflowId)
      const detail = response.data as WorkflowDetail
      const decodeResult = decodeConfigToFormModel(detail.config, detail.is_active)

      setCurrentWorkflowId(workflowId)
      setAdvancedJson(serializeConfig(detail.config))

      if (decodeResult.supported) {
        setFormModel(decodeResult.model)
        setMode('visual')
        setModeWarning('')
        setFeedback({ type: 'success', message: response.message || '工作流详情加载成功。' })
        return
      }

      const fallbackModel = decodeResult.model
      fallbackModel.name = detail.name
      fallbackModel.isActive = detail.is_active
      setFormModel(fallbackModel)
      setMode('advanced')
      setModeWarning(decodeResult.warning?.message || '当前 DSL 暂不支持可视化编辑，已切换到高级模式。')
      setFeedback({
        type: 'warning',
        message: decodeResult.warning?.message || '当前 DSL 暂不支持可视化编辑，已切换到高级模式。',
      })
    } catch (error) {
      const userError = toUserFacingError(error)
      setFeedback({ type: 'error', message: `${userError.message}（${userError.code}）` })
    }
  }, [])

  const switchToAdvancedMode = useCallback(() => {
    try {
      const encoded = encodeFormModel(formModel)
      setAdvancedJson(serializeConfig(encoded.config))
      setMode('advanced')
      setModeWarning('')
      setFeedback({ type: 'info', message: '已切换到高级 JSON 模式。' })
    } catch (error) {
      const adapterError = error as AdapterError
      if (!advancedJson.trim()) {
        setAdvancedJson(
          JSON.stringify(
            {
              id: formModel.configId || 'wf_draft',
              name: formModel.name || '未命名工作流',
              trigger: {
                type: 'lark.bitable.record.changed',
                config: {
                  app_token: formModel.appToken || '',
                  table_id: formModel.tableId || '',
                },
              },
              steps: [{ id: 'step_fallback', type: 'action.custom', config: {} }],
            },
            null,
            2,
          ),
        )
      }

      setMode('advanced')
      setModeWarning(adapterError.message || '可视化数据存在未完成字段，已切换到高级模式。')
      setFeedback({
        type: 'warning',
        message: adapterError.message || '可视化数据存在未完成字段，已切换到高级模式。',
      })
    }
  }, [advancedJson, formModel])

  const switchToVisualMode = useCallback(() => {
    if (!window.confirm('将尝试用当前 JSON 回填可视化表单，可能覆盖未保存改动，确认继续吗？')) {
      return
    }

    try {
      const parsedConfig = parseConfigJson(advancedJson)
      const decodeResult = decodeConfigToFormModel(parsedConfig, formModel.isActive)

      if (!decodeResult.supported) {
        setModeWarning(decodeResult.warning?.message || '当前 DSL 暂不支持可视化模式。')
        setFeedback({
          type: 'warning',
          message: decodeResult.warning?.message || '当前 DSL 暂不支持可视化模式，请继续使用高级模式。',
        })
        return
      }

      setFormModel((previous) => ({
        ...decodeResult.model,
        isActive: previous.isActive,
      }))
      setMode('visual')
      setModeWarning('')
      setFeedback({ type: 'success', message: '已切换到可视化模式。' })
    } catch (error) {
      const adapterError = error as AdapterError
      setFeedback({ type: 'error', message: adapterError.message || '解析高级 JSON 失败。' })
    }
  }, [advancedJson, formModel.isActive])

  const handleDelete = useCallback(
    async (workflowId: string, workflowName: string) => {
      if (!window.confirm(`确认删除工作流「${workflowName}」？`)) {
        return
      }

      try {
        setSubmitting(true)
        const response = await deleteWorkflow(workflowId)
        setFeedback({ type: 'success', message: response.message || '删除成功。' })

        if (currentWorkflowId === workflowId) {
          resetToCreateMode()
        }

        await loadWorkflowList()
      } catch (error) {
        const userError = toUserFacingError(error)
        setFeedback({ type: 'error', message: `${userError.message}（${userError.code}）` })
      } finally {
        setSubmitting(false)
      }
    },
    [currentWorkflowId, loadWorkflowList, resetToCreateMode],
  )

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault()
      setSubmitting(true)

      try {
        let payload: {
          name: string
          isActive: boolean
          scope: {
            type: 'table'
            appToken: string
            tableId: string
            eventTypes?: ('record_created' | 'record_updated' | 'record_deleted')[]
          }
          config: Record<string, unknown>
        }

        if (mode === 'visual') {
          const encoded = encodeFormModel(formModel)
          payload = {
            name: formModel.name.trim(),
            isActive: formModel.isActive,
            scope: encoded.scope,
            config: encoded.config as unknown as Record<string, unknown>,
          }
          setAdvancedJson(serializeConfig(encoded.config))
        } else {
          const parsedConfig = parseConfigJson(advancedJson)
          const scope = resolveScopeFromConfig(parsedConfig, formModel)
          payload = {
            name: formModel.name.trim() || parsedConfig.name || '未命名工作流',
            isActive: formModel.isActive,
            scope,
            config: parsedConfig as unknown as Record<string, unknown>,
          }
        }

        const response = currentWorkflowId
          ? await updateWorkflow(currentWorkflowId, payload)
          : await createWorkflow(payload)

        const saved = response.data as WorkflowDetail
        setCurrentWorkflowId(saved.id)
        setFeedback({
          type: 'success',
          message: response.message || (currentWorkflowId ? '更新成功。' : '创建成功。'),
        })

        const decodeResult = decodeConfigToFormModel(saved.config, saved.is_active)
        if (decodeResult.supported) {
          setFormModel(decodeResult.model)
          setMode('visual')
          setModeWarning('')
        } else {
          const fallbackModel = decodeResult.model
          fallbackModel.name = saved.name
          fallbackModel.isActive = saved.is_active
          setFormModel(fallbackModel)
          setMode('advanced')
          setModeWarning(decodeResult.warning?.message || '保存成功，但 DSL 仅支持在高级模式继续编辑。')
        }

        setAdvancedJson(serializeConfig(saved.config))
        await loadWorkflowList()
      } catch (error) {
        const userError = toUserFacingError(error)
        setFeedback({ type: 'error', message: `${userError.message}（${userError.code}）` })
      } finally {
        setSubmitting(false)
      }
    },
    [advancedJson, currentWorkflowId, formModel, loadWorkflowList, mode],
  )

  return (
    <div className={`studio tone-${tone} ${motionReduced ? 'motion-reduced' : ''}`}>
      <div className="background-layer" aria-hidden />

      <header className="topbar shell-card">
        <div>
          <p className="kicker">Workflow Studio · 可视化优先</p>
          <h1>业务同学也能配置的自动化流程</h1>
          <p className="headline-sub">把“填 JSON”变成“按步骤填写”。高级模式仍可用于复杂排障。</p>
        </div>
        <div className="topbar-actions">
          <label>
            主题
            <select value={tone} onChange={(event) => setTone(event.target.value as (typeof THEME_OPTIONS)[number]['value'])}>
              {THEME_OPTIONS.map((theme) => (
                <option key={theme.value} value={theme.value}>
                  {theme.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn btn-subtle" onClick={() => setMotionReduced((previous) => !previous)}>
            {motionReduced ? '恢复动效' : '减少动效'}
          </button>
          <button type="button" className="btn btn-main" onClick={resetToCreateMode} disabled={submitting}>
            新建流程
          </button>
        </div>
      </header>

      <main className="shell-grid">
        <aside className="browser shell-card">
          <div className="panel-head">
            <h2>流程列表</h2>
            <p>{pagination.total} 条流程 · 启用 {activeWorkflowCount} 条</p>
          </div>

          <div className="browser-toolbar">
            <label>
              状态筛选
              <select
                value={statusFilter}
                onChange={(event) => {
                  const nextValue = event.target.value as 'all' | 'true' | 'false'
                  setStatusFilter(nextValue)
                  setPagination((previous) => ({ ...previous, offset: 0 }))
                }}
                disabled={listLoading}
              >
                <option value="all">全部</option>
                <option value="true">仅启用</option>
                <option value="false">仅停用</option>
              </select>
            </label>
            <button type="button" className="btn btn-subtle" onClick={() => void loadWorkflowList()} disabled={listLoading}>
              {listLoading ? '刷新中...' : '刷新'}
            </button>
          </div>

          {listError ? <div className="error-card">{listError}</div> : null}

          <div className="workflow-list">
            {listLoading ? (
              <div className="empty-card">正在加载工作流列表...</div>
            ) : workflows.length === 0 ? (
              <div className="empty-card">当前没有工作流数据，可先创建一个。</div>
            ) : (
              workflows.map((workflow) => (
                <article key={workflow.id} className="workflow-item" aria-label={`workflow-${workflow.id}`}>
                  <div className="workflow-item-head">
                    <div>
                      <h3>{workflow.name}</h3>
                      <p>{toScopeText(workflow)}</p>
                    </div>
                    <span className={`status-tag ${workflow.is_active ? 'is-active' : 'is-inactive'}`}>
                      {workflow.is_active ? '启用中' : '已停用'}
                    </span>
                  </div>

                  <div className="workflow-meta">
                    <span>{summarizeSteps(workflow)}</span>
                    <span>更新时间：{formatDateTime(workflow.updated_at)}</span>
                  </div>

                  <div className="workflow-actions">
                    <button
                      type="button"
                      className="btn btn-subtle"
                      onClick={() => void openEditor(workflow.id)}
                      disabled={submitting}
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() => void handleDelete(workflow.id, workflow.name)}
                      disabled={submitting}
                    >
                      删除
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>

          <div className="pager">
            <button
              type="button"
              className="btn btn-subtle"
              onClick={() => setPagination((previous) => ({ ...previous, offset: Math.max(0, previous.offset - previous.limit) }))}
              disabled={listLoading || currentPage <= 1}
            >
              上一页
            </button>
            <span>
              第 {currentPage} / {totalPages} 页
            </span>
            <button
              type="button"
              className="btn btn-subtle"
              onClick={() =>
                setPagination((previous) => ({
                  ...previous,
                  offset: Math.min(previous.offset + previous.limit, Math.max(0, (totalPages - 1) * previous.limit)),
                }))
              }
              disabled={listLoading || currentPage >= totalPages}
            >
              下一页
            </button>
          </div>
        </aside>

        <section className="builder">
          <section className="quick-status shell-card">
            <div>
              <h2>{currentWorkflowId ? `编辑工作流（${currentWorkflowId}）` : '新建工作流'}</h2>
              <p>
                当前模式：{mode === 'visual' ? '可视化' : '高级 JSON'} · 完成度 {draftProgress.done}/{draftProgress.total}
              </p>
            </div>
            <div className="status-groups">
              {draftProgress.doneItems.map((item) => (
                <span key={item} className="pill success">
                  {item}
                </span>
              ))}
              {draftProgress.todoItems.map((item) => (
                <span key={item} className="pill pending">
                  {item}
                </span>
              ))}
            </div>
          </section>

          <section className={`feedback-banner type-${feedback.type}`} role="status" aria-live="polite">
            {feedback.message}
          </section>

          {modeWarning ? <section className="warning-banner">提示：{modeWarning}</section> : null}

          <section className="editor shell-card">
            <div className="mode-switch" role="tablist" aria-label="编辑模式切换">
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'visual'}
                className={`btn ${mode === 'visual' ? 'btn-main' : 'btn-subtle'}`}
                onClick={() => {
                  if (mode === 'advanced') {
                    switchToVisualMode()
                  }
                }}
              >
                可视化模式
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'advanced'}
                className={`btn ${mode === 'advanced' ? 'btn-main' : 'btn-subtle'}`}
                onClick={() => {
                  if (mode === 'visual') {
                    switchToAdvancedMode()
                  }
                }}
              >
                高级 JSON 模式
              </button>
            </div>

            <form className="editor-form" onSubmit={handleSubmit}>
              <section className="wizard-card">
                <header>
                  <h3>步骤 1：基础信息</h3>
                  <p>先定义流程名称和启用状态，方便后续管理。</p>
                </header>
                <div className="form-grid two">
                  <label>
                    工作流名称
                    <input
                      type="text"
                      value={formModel.name}
                      onChange={(event) => updateModel((draft) => void (draft.name = event.target.value))}
                      placeholder="例如：A 负责人同步到 B"
                      disabled={submitting}
                    />
                  </label>
                  <label className="switch-line">
                    <input
                      type="checkbox"
                      checked={formModel.isActive}
                      onChange={(event) => updateModel((draft) => void (draft.isActive = event.target.checked))}
                      disabled={submitting}
                    />
                    <span>启用该工作流</span>
                  </label>
                </div>
              </section>

              <section className="wizard-card">
                <header>
                  <h3>步骤 2：触发范围</h3>
                  <p>配置表格作用域和触发事件，支持按钮快捷勾选。</p>
                </header>
                <div className="form-grid two">
                  <label>
                    appToken
                    <input
                      type="text"
                      value={formModel.appToken}
                      onChange={(event) => updateModel((draft) => void (draft.appToken = event.target.value))}
                      placeholder="KaWjbBv..."
                      disabled={submitting}
                    />
                  </label>
                  <label>
                    tableId
                    <input
                      type="text"
                      value={formModel.tableId}
                      onChange={(event) => updateModel((draft) => void (draft.tableId = event.target.value))}
                      placeholder="tblxxxx"
                      disabled={submitting}
                    />
                  </label>
                </div>

                <div className="event-preset-group">
                  {EVENT_TYPE_OPTIONS.map((eventType) => {
                    const selected = selectedEventTypes.has(eventType.value)

                    return (
                      <button
                        key={eventType.value}
                        type="button"
                        className={`chip ${selected ? 'chip-on' : ''}`}
                        onClick={() => {
                          updateModel((draft) => {
                            const set = new Set(parseEventTypeTokens(draft.eventTypesText))
                            if (set.has(eventType.value)) {
                              set.delete(eventType.value)
                            } else {
                              set.add(eventType.value)
                            }
                            draft.eventTypesText = Array.from(set).join(', ')
                          })
                        }}
                        disabled={submitting}
                      >
                        {eventType.label}
                      </button>
                    )
                  })}
                </div>

                <label>
                  eventTypes（逗号分隔，可留空）
                  <input
                    type="text"
                    value={formModel.eventTypesText}
                    onChange={(event) => updateModel((draft) => void (draft.eventTypesText = event.target.value))}
                    placeholder="record_updated, record_deleted"
                    disabled={submitting}
                  />
                </label>
              </section>

              {mode === 'visual' ? (
                <section className="wizard-card">
                  <header className="steps-header">
                    <div>
                      <h3>步骤 3：步骤配置（可视化）</h3>
                      <p>推荐业务同学用这个模式；每个步骤可配置条件、动作和分支。</p>
                    </div>
                    <div className="step-create-tools">
                      <label>
                        新步骤类型
                        <select
                          value={newStepType}
                          onChange={(event) =>
                            setNewStepType(event.target.value as (typeof STEP_TYPE_OPTIONS)[number])
                          }
                          disabled={submitting}
                        >
                          {STEP_TYPE_OPTIONS.map((stepType) => (
                            <option key={stepType} value={stepType}>
                              {stepType}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        className="btn btn-main"
                        onClick={() =>
                          updateModel((draft) => {
                            const newStep = createDefaultStep(newStepType)
                            if (newStepType === 'condition') {
                              newStep.name = `条件步骤 ${draft.steps.length + 1}`
                            } else {
                              newStep.name = `动作步骤 ${draft.steps.length + 1}`
                            }
                            draft.steps.push(newStep)
                          })
                        }
                        disabled={submitting}
                      >
                        添加步骤
                      </button>
                    </div>
                      <button
                        type="button"
                        className="btn btn-subtle"
                        onClick={() =>
                          updateModel((draft) => {
                            const targetAppToken = draft.appToken || ''
                            const c1 = createDefaultStep('condition')
                            c1.id = 'c1'
                            c1.name = '负责人变化且昵称非空'
                            c1.conditionConfig = {
                              logic: 'AND',
                              expressions: [
                                {
                                  id: `expr_${Date.now()}_a`,
                                  field: '账号第一负责人',
                                  operator: 'changed',
                                  valueText: '',
                                  source: 'after',
                                },
                                {
                                  id: `expr_${Date.now()}_b`,
                                  field: '账号名称',
                                  operator: 'exists',
                                  valueText: '',
                                  source: 'after',
                                },
                              ],
                            }
                            c1.onTrue = 'd1'
                            c1.onFalse = ''

                            const d1 = createDefaultStep('action.bitable.delete')
                            d1.id = 'd1'
                            d1.name = '删除B表旧负责人记录'
                            d1.templatePolicy = 'skip'
                            d1.next = 'c2'
                            d1.configText = JSON.stringify(
                              {
                                app_token: targetAppToken,
                                table_id: '',
                                filter: {
                                  conjunction: 'and',
                                  conditions: [
                                    {
                                      field_name: '第一负责人',
                                      operator: 'is',
                                      value: '${trigger.record.beforeFields.账号第一负责人.0.id}',
                                    },
                                  ],
                                },
                              },
                              null,
                              2,
                            )

                            const c2 = createDefaultStep('condition')
                            c2.id = 'c2'
                            c2.name = '变更后负责人有值才创建'
                            c2.conditionConfig = {
                              logic: 'AND',
                              expressions: [
                                {
                                  id: `expr_${Date.now()}_c`,
                                  field: '账号第一负责人',
                                  operator: 'exists',
                                  valueText: '',
                                  source: 'after',
                                },
                              ],
                            }
                            c2.onTrue = 'a1'
                            c2.onFalse = ''

                            const a1 = createDefaultStep('action.bitable.create')
                            a1.id = 'a1'
                            a1.name = '在B表创建新负责人记录'
                            a1.templatePolicy = 'skip'
                            a1.configText = JSON.stringify(
                              {
                                app_token: targetAppToken,
                                table_id: '',
                                fields: {
                                  第一负责人: '${trigger.record.fields.账号第一负责人.0.id}',
                                  账号名称: '${trigger.record.fields.账号名称}',
                                },
                              },
                              null,
                              2,
                            )

                            draft.steps = [c1, d1, c2, a1]
                          })
                        }
                        disabled={submitting}
                      >
                        应用负责人同步模板
                      </button>
                  </header>

                  <div className="steps-list">
                    {formModel.steps.map((step, stepIndex) => (
                      <article key={step.id} className="step-card">
                        <header className="step-card-head">
                          <div>
                            <p className="step-index">步骤 {stepIndex + 1}</p>
                            <h4>{step.name || step.id}</h4>
                          </div>
                          <div className="step-card-tools">
                            <button
                              type="button"
                              className="btn btn-subtle"
                              onClick={() =>
                                updateModel((draft) => {
                                  if (stepIndex <= 0) return
                                  const target = draft.steps[stepIndex]
                                  draft.steps.splice(stepIndex, 1)
                                  draft.steps.splice(stepIndex - 1, 0, target)
                                })
                              }
                              disabled={submitting || stepIndex <= 0}
                            >
                              上移
                            </button>
                            <button
                              type="button"
                              className="btn btn-subtle"
                              onClick={() =>
                                updateModel((draft) => {
                                  if (stepIndex >= draft.steps.length - 1) return
                                  const target = draft.steps[stepIndex]
                                  draft.steps.splice(stepIndex, 1)
                                  draft.steps.splice(stepIndex + 1, 0, target)
                                })
                              }
                              disabled={submitting || stepIndex >= formModel.steps.length - 1}
                            >
                              下移
                            </button>
                            <button
                              type="button"
                              className="btn btn-danger"
                              onClick={() =>
                                updateModel((draft) => {
                                  if (draft.steps.length <= 1) return
                                  draft.steps.splice(stepIndex, 1)
                                })
                              }
                              disabled={submitting || formModel.steps.length <= 1}
                            >
                              删除步骤
                            </button>
                          </div>
                        </header>

                        <div className="form-grid three">
                          <label>
                            step.id
                            <input
                              type="text"
                              value={step.id}
                              onChange={(event) =>
                                updateModel((draft) => void (draft.steps[stepIndex].id = event.target.value))
                              }
                              disabled={submitting}
                            />
                          </label>
                          <label>
                            step.type
                            <select
                              value={step.type}
                              onChange={(event) =>
                                updateModel((draft) => void (draft.steps[stepIndex].type = event.target.value))
                              }
                              disabled={submitting}
                            >
                              {STEP_TYPE_OPTIONS.map((stepType) => (
                                <option key={stepType} value={stepType}>
                                  {stepType}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            step.name
                            <input
                              type="text"
                              value={step.name}
                              onChange={(event) =>
                                updateModel((draft) => void (draft.steps[stepIndex].name = event.target.value))
                              }
                              disabled={submitting}
                            />
                          </label>
                        </div>

                        {step.type === 'condition' ? (
                          <ConditionEditor
                            condition={step.conditionConfig}
                            onLogicChange={(logic) =>
                              updateModel((draft) => void (draft.steps[stepIndex].conditionConfig.logic = logic))
                            }
                            onExpressionChange={(expressionId, patch) =>
                              updateModel((draft) => {
                                const target = draft.steps[stepIndex].conditionConfig.expressions.find(
                                  (expression) => expression.id === expressionId,
                                )
                                if (!target) return
                                Object.assign(target, patch)
                              })
                            }
                            onAddExpression={() =>
                              updateModel((draft) => {
                                draft.steps[stepIndex].conditionConfig.expressions.push({
                                  id: `expr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                                  field: '',
                                  operator: 'equals',
                                  valueText: '',
                                  source: 'after',
                                })
                              })
                            }
                            onRemoveExpression={(expressionId) =>
                              updateModel((draft) => {
                                const expressions = draft.steps[stepIndex].conditionConfig.expressions
                                const index = expressions.findIndex((expression) => expression.id === expressionId)
                                if (index >= 0 && expressions.length > 1) {
                                  expressions.splice(index, 1)
                                }
                              })
                            }
                            disabled={submitting}
                          />
                        ) : (
                          <StepActionConfigEditor
                            step={step}
                            onConfigTextChange={(nextConfig) =>
                              updateModel((draft) => void (draft.steps[stepIndex].configText = nextConfig))
                            }
                            disabled={submitting}
                          />
                        )}

                        <div className="form-grid three">
                          <label>
                            next（默认下一步）
                            <select
                              value={step.next}
                              onChange={(event) =>
                                updateModel((draft) => void (draft.steps[stepIndex].next = event.target.value))
                              }
                              disabled={submitting}
                            >
                              <option value="">不指定</option>
                              {stepIdOptions.map((stepId) => (
                                <option key={stepId} value={stepId}>
                                  {stepId}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            onTrue（条件为真）
                            <select
                              value={step.onTrue}
                              onChange={(event) =>
                                updateModel((draft) => void (draft.steps[stepIndex].onTrue = event.target.value))
                              }
                              disabled={submitting}
                            >
                              <option value="">不指定</option>
                              {stepIdOptions.map((stepId) => (
                                <option key={`${step.id}-true-${stepId}`} value={stepId}>
                                  {stepId}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            onFalse（条件为假）
                            <select
                              value={step.onFalse}
                              onChange={(event) =>
                                updateModel((draft) => void (draft.steps[stepIndex].onFalse = event.target.value))
                              }
                              disabled={submitting}
                            >
                              <option value="">不指定</option>
                              {stepIdOptions.map((stepId) => (
                                <option key={`${step.id}-false-${stepId}`} value={stepId}>
                                  {stepId}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>

                        <div className="form-grid three compact">
                          <label>
                            templatePolicy
                            <select
                              value={step.templatePolicy}
                              onChange={(event) =>
                                updateModel(
                                  (draft) =>
                                    void (draft.steps[stepIndex].templatePolicy = event.target.value as FormModel['steps'][number]['templatePolicy']),
                                )
                              }
                              disabled={submitting}
                            >
                              <option value="">默认</option>
                              <option value="fail">fail</option>
                              <option value="skip">skip</option>
                            </select>
                          </label>
                          <label className="switch-line">
                            <input
                              type="checkbox"
                              checked={step.whenEnabled}
                              onChange={(event) =>
                                updateModel((draft) => void (draft.steps[stepIndex].whenEnabled = event.target.checked))
                              }
                              disabled={submitting}
                            />
                            <span>启用 when 守卫</span>
                          </label>
                        </div>

                        {step.whenEnabled ? (
                          <section className="when-block">
                            <h5>when 条件（步骤守卫）</h5>
                            <ConditionEditor
                              condition={step.whenCondition}
                              onLogicChange={(logic) =>
                                updateModel((draft) => void (draft.steps[stepIndex].whenCondition.logic = logic))
                              }
                              onExpressionChange={(expressionId, patch) =>
                                updateModel((draft) => {
                                  const target = draft.steps[stepIndex].whenCondition.expressions.find(
                                    (expression) => expression.id === expressionId,
                                  )
                                  if (!target) return
                                  Object.assign(target, patch)
                                })
                              }
                              onAddExpression={() =>
                                updateModel((draft) => {
                                  draft.steps[stepIndex].whenCondition.expressions.push({
                                    id: `expr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                                    field: '',
                                    operator: 'equals',
                                    valueText: '',
                                    source: 'after',
                                  })
                                })
                              }
                              onRemoveExpression={(expressionId) =>
                                updateModel((draft) => {
                                  const expressions = draft.steps[stepIndex].whenCondition.expressions
                                  const index = expressions.findIndex((expression) => expression.id === expressionId)
                                  if (index >= 0 && expressions.length > 1) {
                                    expressions.splice(index, 1)
                                  }
                                })
                              }
                              disabled={submitting}
                            />
                          </section>
                        ) : null}
                      </article>
                    ))}
                  </div>
                </section>
              ) : (
                <section className="wizard-card">
                  <header>
                    <h3>高级 JSON（DSL）</h3>
                    <p>用于排障或复杂配置。提交前系统会校验基础结构与 scope。</p>
                  </header>
                  <label>
                    Workflow DSL JSON
                    <textarea
                      className="json-editor"
                      rows={22}
                      value={advancedJson}
                      onChange={(event) => setAdvancedJson(event.target.value)}
                      spellCheck={false}
                      disabled={submitting}
                    />
                  </label>
                </section>
              )}

              <section className="submit-area shell-card">
                <div>
                  <h3>步骤 4：提交</h3>
                  <p>保存后将实时写入工作流配置，可回到列表继续编辑。</p>
                </div>
                <div className="submit-actions">
                  <button type="submit" className="btn btn-main" disabled={submitting}>
                    {submitting ? '提交中...' : currentWorkflowId ? '保存更新' : '创建工作流'}
                  </button>
                  <button type="button" className="btn btn-subtle" onClick={resetToCreateMode} disabled={submitting}>
                    重置为新建
                  </button>
                </div>
              </section>
            </form>
          </section>
        </section>
      </main>
    </div>
  )
}

export default App
