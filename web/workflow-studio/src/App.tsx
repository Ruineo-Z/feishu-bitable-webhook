import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react'
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
import { ADDABLE_NODE_CATALOG_ITEMS, STEP_TYPE_OPTIONS, createNodeCatalogGroups, toStepTypeLabel } from './lib/node-registry'
import type { NodeCatalogItem } from './lib/node-registry'
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

const CONDITION_OPERATOR_LABELS: Record<(typeof CONDITION_OPERATOR_OPTIONS)[number], string> = {
  changed: 'changed（发生变化）',
  equals: 'equals（等于）',
  notEquals: 'notEquals（不等于）',
  exists: 'exists（有值）',
  notExists: 'notExists（无值）',
  contains: 'contains（包含）',
  doesNotContain: 'doesNotContain（不包含）',
  isEmpty: 'isEmpty（为空）',
  isNotEmpty: 'isNotEmpty（不为空）',
  greaterThan: 'greaterThan（大于）',
  lessThan: 'lessThan（小于）',
}

type ScopePreset = {
  key: string
  label: string
  appToken: string
  tableId: string
}


type FeedbackType = 'info' | 'success' | 'error' | 'warning'
type BuilderMode = 'visual' | 'advanced'
type PreviewNodeKey = 'trigger' | 'condition' | 'action' | 'end'
type CanvasHandle = 'left' | 'right' | 'top' | 'bottom'
type CanvasCurveDirection = 'horizontal' | 'vertical'
type CanvasEdgeVariant = 'main' | 'if' | 'else'

type CanvasPoint = {
  x: number
  y: number
}

type CanvasNodeLayoutMap = Record<PreviewNodeKey, CanvasPoint>

type CanvasEdgeTemplate = {
  id: string
  from: { node: PreviewNodeKey; handle: CanvasHandle }
  to: { node: PreviewNodeKey; handle: CanvasHandle }
  variant: CanvasEdgeVariant
  curve: CanvasCurveDirection
  branchLabel?: string
  labelOffset?: CanvasPoint
}

type CanvasEdge = {
  id: string
  variant: CanvasEdgeVariant
  path: string
  branchLabel?: string
  labelPoint?: CanvasPoint
}

const CANVAS_MIN_SCALE = 0.2
const CANVAS_MAX_SCALE = 2
const CANVAS_ZOOM_STEP = 0.12
const CANVAS_PAN_PADDING = 220
const CANVAS_CONTENT_BOUNDS = {
  left: 96,
  right: 648,
  top: 52,
  bottom: 418,
}

const CANVAS_NODE_SIZES: Record<PreviewNodeKey, { width: number; height: number }> = {
  trigger: { width: 430, height: 72 },
  condition: { width: 430, height: 72 },
  action: { width: 30, height: 30 },
  end: { width: 30, height: 30 },
}

const CANVAS_DEFAULT_NODE_LAYOUTS: CanvasNodeLayoutMap = {
  trigger: { x: 166, y: 84 },
  condition: { x: 166, y: 214 },
  action: { x: 111, y: 384 },
  end: { x: 615, y: 384 },
}

const CANVAS_EDGE_TEMPLATES: CanvasEdgeTemplate[] = [
  {
    id: 'trigger-to-condition',
    from: { node: 'trigger', handle: 'bottom' },
    to: { node: 'condition', handle: 'top' },
    variant: 'main',
    curve: 'vertical',
  },
  {
    id: 'condition-true-to-action',
    from: { node: 'condition', handle: 'left' },
    to: { node: 'action', handle: 'top' },
    variant: 'if',
    curve: 'horizontal',
    branchLabel: '满足',
    labelOffset: { x: -24, y: -14 },
  },
  {
    id: 'action-to-end',
    from: { node: 'action', handle: 'right' },
    to: { node: 'end', handle: 'left' },
    variant: 'main',
    curve: 'horizontal',
  },
  {
    id: 'condition-false-to-end',
    from: { node: 'condition', handle: 'right' },
    to: { node: 'end', handle: 'top' },
    variant: 'else',
    curve: 'horizontal',
    branchLabel: '不满足',
    labelOffset: { x: 28, y: -14 },
  },
]

function clampCanvasScale(value: number): number {
  return Math.min(CANVAS_MAX_SCALE, Math.max(CANVAS_MIN_SCALE, value))
}

function createDefaultNodeLayouts(): CanvasNodeLayoutMap {
  return {
    trigger: { ...CANVAS_DEFAULT_NODE_LAYOUTS.trigger },
    condition: { ...CANVAS_DEFAULT_NODE_LAYOUTS.condition },
    action: { ...CANVAS_DEFAULT_NODE_LAYOUTS.action },
    end: { ...CANVAS_DEFAULT_NODE_LAYOUTS.end },
  }
}

function clampCanvasOffset(offset: CanvasPoint, surface: HTMLDivElement | null, scale: number): CanvasPoint {
  if (!surface) {
    return offset
  }

  let minX = surface.clientWidth - (CANVAS_CONTENT_BOUNDS.right + CANVAS_PAN_PADDING) * scale
  let maxX = CANVAS_PAN_PADDING - CANVAS_CONTENT_BOUNDS.left * scale
  let minY = surface.clientHeight - (CANVAS_CONTENT_BOUNDS.bottom + CANVAS_PAN_PADDING) * scale
  let maxY = CANVAS_PAN_PADDING - CANVAS_CONTENT_BOUNDS.top * scale

  if (minX > maxX) {
    const centerX = (minX + maxX) / 2
    minX = centerX - CANVAS_PAN_PADDING
    maxX = centerX + CANVAS_PAN_PADDING
  }

  if (minY > maxY) {
    const centerY = (minY + maxY) / 2
    minY = centerY - CANVAS_PAN_PADDING
    maxY = centerY + CANVAS_PAN_PADDING
  }

  return {
    x: Math.min(maxX, Math.max(minX, offset.x)),
    y: Math.min(maxY, Math.max(minY, offset.y)),
  }
}

function clampNodeLayout(node: PreviewNodeKey, layout: CanvasPoint): CanvasPoint {
  const size = CANVAS_NODE_SIZES[node]

  return {
    x: Math.min(CANVAS_CONTENT_BOUNDS.right - size.width, Math.max(CANVAS_CONTENT_BOUNDS.left, layout.x)),
    y: Math.min(CANVAS_CONTENT_BOUNDS.bottom - size.height, Math.max(CANVAS_CONTENT_BOUNDS.top, layout.y)),
  }
}

function resolveNodeAnchor(layouts: CanvasNodeLayoutMap, node: PreviewNodeKey, handle: CanvasHandle): CanvasPoint {
  const layout = layouts[node]
  const size = CANVAS_NODE_SIZES[node]

  switch (handle) {
    case 'left':
      return { x: layout.x, y: layout.y + size.height / 2 }
    case 'right':
      return { x: layout.x + size.width, y: layout.y + size.height / 2 }
    case 'top':
      return { x: layout.x + size.width / 2, y: layout.y }
    case 'bottom':
      return { x: layout.x + size.width / 2, y: layout.y + size.height }
    default:
      return layout
  }
}

function createStraightPath(
  from: CanvasPoint,
  to: CanvasPoint,
  direction: CanvasCurveDirection,
): { path: string; midpoint: CanvasPoint } {
  if (direction === 'vertical') {
    const midY = from.y + (to.y - from.y) / 2
    return {
      path: `M ${from.x} ${from.y} L ${from.x} ${midY} L ${to.x} ${midY} L ${to.x} ${to.y}`,
      midpoint: { x: (from.x + to.x) / 2, y: midY },
    }
  }

  const midX = from.x + (to.x - from.x) / 2
  return {
    path: `M ${from.x} ${from.y} L ${midX} ${from.y} L ${midX} ${to.y} L ${to.x} ${to.y}`,
    midpoint: { x: midX, y: (from.y + to.y) / 2 },
  }
}

function buildCanvasEdges(layouts: CanvasNodeLayoutMap): CanvasEdge[] {
  return CANVAS_EDGE_TEMPLATES.map((template) => {
    const from = resolveNodeAnchor(layouts, template.from.node, template.from.handle)
    const to = resolveNodeAnchor(layouts, template.to.node, template.to.handle)
    const curve = createStraightPath(from, to, template.curve)

    const labelPoint = template.branchLabel
      ? {
          x: curve.midpoint.x + (template.labelOffset?.x ?? 0),
          y: curve.midpoint.y + (template.labelOffset?.y ?? 0),
        }
      : undefined

    return {
      id: template.id,
      variant: template.variant,
      path: curve.path,
      branchLabel: template.branchLabel,
      labelPoint,
    }
  })
}

function getCenteredCanvasOffset(surface: HTMLDivElement | null, scale: number): { x: number; y: number } {
  if (!surface) {
    return { x: 0, y: 0 }
  }

  const centerX = (CANVAS_CONTENT_BOUNDS.left + CANVAS_CONTENT_BOUNDS.right) / 2
  const centerY = (CANVAS_CONTENT_BOUNDS.top + CANVAS_CONTENT_BOUNDS.bottom) / 2

  return {
    x: surface.clientWidth / 2 - centerX * scale,
    y: surface.clientHeight / 2 - centerY * scale,
  }
}

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

function parseEventTypeTokens(text: string): string[] {
  return text
    .split(',')
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
}

function summarizeCondition(condition: ConditionFormModel): string {
  if (!condition.expressions.length) return '暂无条件'

  const parts = condition.expressions.map((expression) => {
    const field = expression.field.trim() || '字段'
    const operator = expression.operator.trim() || 'equals'
    const operatorLabel = CONDITION_OPERATOR_LABELS[operator as (typeof CONDITION_OPERATOR_OPTIONS)[number]] || operator
    const value = expression.valueText.trim()
    const source = expression.source === 'before' ? '变更前' : '变更后'

    if (value) {
      return `${source} ${field} ${operatorLabel} ${value}`
    }
    return `${source} ${field} ${operatorLabel}`
  })

  return parts.join(condition.logic === 'OR' ? ' 或 ' : ' 且 ')
}

function summarizeStepForPreview(step: FormModel['steps'][number], index: number): string {
  const typeLabel = toStepTypeLabel(step.type)
  const name = step.name.trim() || `${typeLabel}${index + 1}`

  if (step.type === 'condition') {
    return `步骤${index + 1}「${name}」：判断 ${summarizeCondition(step.conditionConfig)}`
  }

  if (step.type === 'action.bitable.create' || step.type === 'action.bitable.delete') {
    return `步骤${index + 1}「${name}」：执行 ${typeLabel}`
  }

  return `步骤${index + 1}「${name}」：执行 ${typeLabel}`
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
                    {CONDITION_OPERATOR_LABELS[operator]}
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
  const [, setFeedback] = useState<Feedback>({
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
  const [, setModeWarning] = useState('')
  const [advancedJson, setAdvancedJson] = useState('')
  const [formModel, setFormModel] = useState<FormModel>(() => createDefaultFormModel())

  const [tone, setTone] = useState<(typeof THEME_OPTIONS)[number]['value']>('halo')
  const [motionReduced, setMotionReduced] = useState(false)
  const [newStepType, setNewStepType] = useState<(typeof STEP_TYPE_OPTIONS)[number]>('action.bitable.create')
  const [, setActiveConfigSection] = useState<'trigger' | 'condition' | 'action' | 'publish'>('trigger')
  const [selectedPreviewNode, setSelectedPreviewNode] = useState<PreviewNodeKey | null>(null)
  const [isNodeCatalogOpen, setIsNodeCatalogOpen] = useState(false)
  const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 0 })
  const [canvasScale, setCanvasScale] = useState(1)
  const [isCanvasDragging, setIsCanvasDragging] = useState(false)
  const [nodeLayouts, setNodeLayouts] = useState<CanvasNodeLayoutMap>(() => createDefaultNodeLayouts())

  const canvasSurfaceRef = useRef<HTMLDivElement | null>(null)
  const canvasDragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    originX: number
    originY: number
  } | null>(null)
  const nodeDragRef = useRef<{
    pointerId: number
    node: PreviewNodeKey
    startX: number
    startY: number
    originX: number
    originY: number
    moved: boolean
    element: HTMLButtonElement
  } | null>(null)
  const skipNodeClickRef = useRef(false)
  const editorFormRef = useRef<HTMLFormElement | null>(null)

  const [scopePresets, setScopePresets] = useState<ScopePreset[]>([])
  const [selectedScopePresetKey, setSelectedScopePresetKey] = useState('')

  useEffect(() => {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setMotionReduced(true)
    }
  }, [])

  useEffect(() => {
    const surface = canvasSurfaceRef.current
    if (!surface) return

    const preventPageScroll = (event: WheelEvent) => {
      event.preventDefault()
    }

    surface.addEventListener('wheel', preventPageScroll, { passive: false })

    return () => {
      surface.removeEventListener('wheel', preventPageScroll)
    }
  }, [])

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const surface = canvasSurfaceRef.current
      if (!surface) return

      const initialScale = 1
      setCanvasScale(initialScale)
      setCanvasOffset(
        clampCanvasOffset(getCenteredCanvasOffset(surface, initialScale), surface, initialScale),
      )
    })

    return () => window.cancelAnimationFrame(frame)
  }, [])

  const currentPage = useMemo(() => Math.floor(pagination.offset / pagination.limit) + 1, [pagination])
  const totalPages = useMemo(() => Math.max(1, Math.ceil(pagination.total / pagination.limit)), [pagination])

  const selectedEventTypes = useMemo(() => new Set(parseEventTypeTokens(formModel.eventTypesText)), [formModel.eventTypesText])
  const stepIdOptions = useMemo(
    () => formModel.steps.map((step) => step.id.trim()).filter((id) => id.length > 0),
    [formModel.steps],
  )

  const conditionSteps = useMemo(
    () => formModel.steps.filter((step) => step.type === 'condition'),
    [formModel.steps],
  )

  const actionSteps = useMemo(
    () => formModel.steps.filter((step) => step.type !== 'condition'),
    [formModel.steps],
  )

  const primaryConditionStep = useMemo(() => conditionSteps[0] ?? null, [conditionSteps])
  const primaryActionStep = useMemo(() => actionSteps[0] ?? null, [actionSteps])

  const previewLines = useMemo(
    () => formModel.steps.map((step, index) => summarizeStepForPreview(step, index)),
    [formModel.steps],
  )

  const visibleStepEntries = useMemo(() => {
    return formModel.steps
      .map((step, index) => ({ step, index }))
      .filter(({ step }) => {
        if (selectedPreviewNode === 'condition') {
          return step.type === 'condition'
        }

        if (selectedPreviewNode === 'action') {
          return step.type !== 'condition'
        }

        return true
      })
  }, [formModel.steps, selectedPreviewNode])

  const publishTodoItems = useMemo(() => {
    const todos: string[] = []

    if (!formModel.name.trim()) {
      todos.push('请先填写自动化名称')
    }

    if (!formModel.appToken.trim() || !formModel.tableId.trim()) {
      todos.push('请补齐触发器的 appToken/tableId')
    }

    if (!parseEventTypeTokens(formModel.eventTypesText).length) {
      todos.push('请至少选择 1 个触发事件')
    }

    if (!conditionSteps.length) {
      todos.push('建议至少配置 1 个条件，避免动作误触发')
    }

    if (!actionSteps.length) {
      todos.push('请至少配置 1 个动作步骤')
    }

    return todos
  }, [actionSteps.length, conditionSteps.length, formModel.appToken, formModel.eventTypesText, formModel.name, formModel.tableId])

  const openPreviewNode = useCallback((node: PreviewNodeKey) => {
    if (selectedPreviewNode === node) {
      setSelectedPreviewNode(null)
      return
    }

    if (node === 'end') {
      setActiveConfigSection('publish')
      setSelectedPreviewNode('end')
      setIsNodeCatalogOpen(false)
      return
    }

    setActiveConfigSection(node)
    setSelectedPreviewNode(node)
    setIsNodeCatalogOpen(false)
  }, [selectedPreviewNode])

  const setCanvasOffsetClamped = useCallback((nextOffset: CanvasPoint, scale: number) => {
    setCanvasOffset(clampCanvasOffset(nextOffset, canvasSurfaceRef.current, scale))
  }, [])

  const handleCanvasPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return
      }

      const target = event.target as Element | null
      if (target?.closest('button, input, textarea, select, a, label, [data-no-canvas-drag="true"]')) {
        return
      }

      setSelectedPreviewNode(null)
      setIsNodeCatalogOpen(false)

      canvasDragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: canvasOffset.x,
        originY: canvasOffset.y,
      }
      setIsCanvasDragging(true)
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    [canvasOffset.x, canvasOffset.y],
  )

  const handleNodePointerDown = useCallback(
    (node: PreviewNodeKey, event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      nodeDragRef.current = {
        pointerId: event.pointerId,
        node,
        startX: event.clientX,
        startY: event.clientY,
        originX: nodeLayouts[node].x,
        originY: nodeLayouts[node].y,
        moved: false,
        element: event.currentTarget,
      }
      setIsCanvasDragging(true)
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    [nodeLayouts],
  )

  const handleCanvasPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const nodeDragState = nodeDragRef.current
      if (nodeDragState && nodeDragState.pointerId === event.pointerId) {
        const deltaX = (event.clientX - nodeDragState.startX) / canvasScale
        const deltaY = (event.clientY - nodeDragState.startY) / canvasScale
        const moved = Math.abs(deltaX) > 1.5 || Math.abs(deltaY) > 1.5

        if (moved) {
          nodeDragState.moved = true
          skipNodeClickRef.current = true
        }

        const nextLayout = clampNodeLayout(nodeDragState.node, {
          x: nodeDragState.originX + deltaX,
          y: nodeDragState.originY + deltaY,
        })

        setNodeLayouts((previous) => ({
          ...previous,
          [nodeDragState.node]: nextLayout,
        }))
        return
      }

      const dragState = canvasDragRef.current
      if (!dragState || dragState.pointerId !== event.pointerId) {
        return
      }

      const nextX = dragState.originX + (event.clientX - dragState.startX)
      const nextY = dragState.originY + (event.clientY - dragState.startY)
      setCanvasOffsetClamped({ x: nextX, y: nextY }, canvasScale)
    },
    [canvasScale, setCanvasOffsetClamped],
  )

  const handleCanvasPointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const nodeDragState = nodeDragRef.current
    if (nodeDragState && nodeDragState.pointerId === event.pointerId) {
      if (nodeDragState.element.hasPointerCapture(event.pointerId)) {
        nodeDragState.element.releasePointerCapture(event.pointerId)
      }
      nodeDragRef.current = null
      setIsCanvasDragging(false)
      return
    }

    const dragState = canvasDragRef.current
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    canvasDragRef.current = null
    setIsCanvasDragging(false)
  }, [])

  const applyCanvasScale = useCallback(
    (nextRawScale: number, anchor: { x: number; y: number }) => {
      const nextScale = clampCanvasScale(Number(nextRawScale.toFixed(3)))
      if (nextScale === canvasScale) {
        return
      }

      const worldX = (anchor.x - canvasOffset.x) / canvasScale
      const worldY = (anchor.y - canvasOffset.y) / canvasScale

      setCanvasScale(nextScale)
      setCanvasOffset(
        clampCanvasOffset(
          {
            x: anchor.x - worldX * nextScale,
            y: anchor.y - worldY * nextScale,
          },
          canvasSurfaceRef.current,
          nextScale,
        ),
      )
    },
    [canvasOffset.x, canvasOffset.y, canvasScale],
  )

  const handleCanvasWheel = useCallback(
    (event: ReactWheelEvent<HTMLDivElement>) => {
      event.preventDefault()
      event.stopPropagation()
      if (typeof event.nativeEvent.stopImmediatePropagation === 'function') {
        event.nativeEvent.stopImmediatePropagation()
      }
      const rect = event.currentTarget.getBoundingClientRect()
      const anchor = { x: event.clientX - rect.left, y: event.clientY - rect.top }
      const ratio = event.deltaY < 0 ? 1 + CANVAS_ZOOM_STEP : 1 - CANVAS_ZOOM_STEP
      applyCanvasScale(canvasScale * ratio, anchor)
    },
    [applyCanvasScale, canvasScale],
  )

  const zoomPercent = useMemo(() => Math.round(canvasScale * 100), [canvasScale])

  const zoomCanvas = useCallback(
    (direction: 'in' | 'out') => {
      const surface = canvasSurfaceRef.current
      const anchor = surface
        ? { x: surface.clientWidth / 2, y: surface.clientHeight / 2 }
        : { x: 0, y: 0 }
      const ratio = direction === 'in' ? 1 + CANVAS_ZOOM_STEP : 1 - CANVAS_ZOOM_STEP
      applyCanvasScale(canvasScale * ratio, anchor)
    },
    [applyCanvasScale, canvasScale],
  )

  const resetCanvasViewport = useCallback(() => {
    const nextScale = 1
    setCanvasScale(nextScale)
    setCanvasOffset(
      clampCanvasOffset(getCenteredCanvasOffset(canvasSurfaceRef.current, nextScale), canvasSurfaceRef.current, nextScale),
    )
  }, [])

  const handleCanvasDoubleClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const target = event.target as Element | null
      if (target?.closest('button, input, textarea, select, a, label, [data-no-canvas-drag="true"]')) {
        return
      }

      resetCanvasViewport()
    },
    [resetCanvasViewport],
  )

  const handleCanvasNodeClick = useCallback(
    (node: PreviewNodeKey) => {
      if (skipNodeClickRef.current) {
        skipNodeClickRef.current = false
        return
      }

      openPreviewNode(node)
    },
    [openPreviewNode],
  )

  const handleCanvasAddNodeClick = useCallback(() => {
    if (skipNodeClickRef.current) {
      skipNodeClickRef.current = false
      return
    }

    setIsNodeCatalogOpen(true)
  }, [])

  const selectedPreviewNodeLabel = useMemo(() => {
    switch (selectedPreviewNode) {
      case 'trigger':
        return '触发器 t1'
      case 'condition':
        return primaryConditionStep?.name.trim() || '条件 c1'
      case 'action':
        return primaryActionStep?.name.trim() || '动作 a1'
      case 'end':
        return '结束 end'
      default:
        return '节点'
    }
  }, [primaryActionStep, primaryConditionStep, selectedPreviewNode])

  const isInspectorVisible = selectedPreviewNode !== null
  const isTriggerNodeSelected = selectedPreviewNode === 'trigger'
  const isConditionNodeSelected = selectedPreviewNode === 'condition'
  const isActionNodeSelected = selectedPreviewNode === 'action'
  const isEndNodeSelected = selectedPreviewNode === 'end'

  const primaryConditionName = primaryConditionStep?.name.trim() || '条件 c1'
  const primaryConditionSummary = primaryConditionStep ? summarizeCondition(primaryConditionStep.conditionConfig) : '暂无条件表达式'

  const primaryActionName = primaryActionStep?.name.trim() || '动作 a1'
  const primaryActionTypeLabel = useMemo(() => {
    if (!primaryActionStep) {
      return '未配置动作'
    }

    return toStepTypeLabel(primaryActionStep.type)
  }, [primaryActionStep])

  const canvasEdges = useMemo(() => buildCanvasEdges(nodeLayouts), [nodeLayouts])

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

  useEffect(() => {
    if (!workflows.length) {
      setScopePresets([])
      return
    }

    const unique = new Map<string, ScopePreset>()
    workflows.forEach((workflow) => {
      const appToken = workflow.scope?.appToken || ''
      const tableId = workflow.scope?.tableId || ''
      if (!appToken || !tableId) return

      const key = `${appToken}::${tableId}`
      if (!unique.has(key)) {
        unique.set(key, {
          key,
          label: `${workflow.name}（${appToken.slice(0, 8)}... / ${tableId}）`,
          appToken,
          tableId,
        })
      }
    })

    setScopePresets(Array.from(unique.values()))
  }, [workflows])

  const updateModel = useCallback((mutator: (draft: FormModel) => void) => {
    setFormModel((previous) => {
      const draft = cloneModel(previous)
      mutator(draft)
      return draft
    })
  }, [])

  const nodeCatalogGroups = useMemo(() => createNodeCatalogGroups(ADDABLE_NODE_CATALOG_ITEMS), [])

  const handleAddNodeFromCatalog = useCallback((item: NodeCatalogItem) => {
    if (!item.stepType) {
      return
    }

    updateModel((draft) => {
      const nextStep = createDefaultStep(item.stepType)
      const stepCount = draft.steps.length + 1
      if (!nextStep.name.trim()) {
        nextStep.name = item.suggestedName ? `${item.suggestedName} ${stepCount}` : `步骤 ${stepCount}`
      }
      draft.steps.push(nextStep)
    })

    if (item.category === 'condition') {
      setActiveConfigSection('condition')
      setSelectedPreviewNode('condition')
    } else if (item.category === 'action') {
      setActiveConfigSection('action')
      setSelectedPreviewNode('action')
    }

    setIsNodeCatalogOpen(false)
  }, [updateModel])

  const resetToCreateMode = useCallback(() => {
    const defaultModel = createDefaultFormModel()
    const defaultScale = 1

    setCurrentWorkflowId(null)
    setActiveConfigSection('trigger')
    setMode('visual')
    setModeWarning('')
    setFormModel(defaultModel)
    setNodeLayouts(createDefaultNodeLayouts())
    setSelectedPreviewNode(null)
    setIsNodeCatalogOpen(false)
    setCanvasScale(defaultScale)
    setCanvasOffset(
      clampCanvasOffset(
        getCenteredCanvasOffset(canvasSurfaceRef.current, defaultScale),
        canvasSurfaceRef.current,
        defaultScale,
      ),
    )
    canvasDragRef.current = null
    nodeDragRef.current = null
    skipNodeClickRef.current = false
    setIsCanvasDragging(false)

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
      setSelectedPreviewNode(null)
      setIsNodeCatalogOpen(false)
      setNodeLayouts(createDefaultNodeLayouts())
      canvasDragRef.current = null
      nodeDragRef.current = null
      skipNodeClickRef.current = false
      setIsCanvasDragging(false)
      setAdvancedJson(serializeConfig(detail.config))

      if (decodeResult.supported) {
        setFormModel(decodeResult.model)
        setMode('visual')
        setActiveConfigSection('trigger')
        setModeWarning('')
        setFeedback({ type: 'success', message: response.message || '工作流详情加载成功。' })
        return
      }

      const fallbackModel = decodeResult.model
      fallbackModel.name = detail.name
      fallbackModel.isActive = detail.is_active
      setFormModel(fallbackModel)
      setMode('advanced')
      setActiveConfigSection('publish')
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
      setActiveConfigSection('publish')
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
      setActiveConfigSection('publish')
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
      setActiveConfigSection('trigger')
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
          setActiveConfigSection('trigger')
          setModeWarning('')
        } else {
          const fallbackModel = decodeResult.model
          fallbackModel.name = saved.name
          fallbackModel.isActive = saved.is_active
          setFormModel(fallbackModel)
          setMode('advanced')
          setActiveConfigSection('publish')
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
          <p className="kicker">Workflow Studio</p>
          <h1>Workflow 编排控制台</h1>
          <p className="headline-sub">左侧流程列表 · 中间拖拉画布 · 右侧节点编排</p>
        </div>
        <div className="topbar-actions">
          <div className="topbar-tools-legacy">
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
          </div>
          <button
            type="button"
            className="btn btn-subtle"
            onClick={() => setFeedback({ type: 'info', message: '运行预览能力已准备，后续可接执行日志抽屉。' })}
          >
            运行预览
          </button>
          <button
            type="button"
            className="btn btn-main"
            onClick={() => editorFormRef.current?.requestSubmit()}
            disabled={submitting || !isInspectorVisible}
          >
            {submitting ? '发布中...' : '发布配置'}
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
                    <h3>{workflow.name}</h3>
                    {workflow.is_active ? <span className="status-dot" aria-label="启用中" title="启用中" /> : null}
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

        <section className="workflow-canvas shell-card" aria-label="workflow-canvas">
          {isNodeCatalogOpen ? (
            <div className="node-catalog-popover" data-no-canvas-drag="true">
              <div className="node-catalog-head">
                <h3>添加节点</h3>
                <button
                  type="button"
                  className="btn btn-subtle"
                  data-no-canvas-drag="true"
                  onClick={() => setIsNodeCatalogOpen(false)}
                >
                  关闭
                </button>
              </div>
              <div className="node-catalog-groups">
                {nodeCatalogGroups.map((group) => (
                  <section key={group.category} className="node-catalog-group">
                    <h4>{group.title}</h4>
                    <div className="node-catalog-list">
                      {group.items.map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          className="node-catalog-item"
                          data-no-canvas-drag="true"
                          onClick={() => handleAddNodeFromCatalog(item)}
                        >
                          <strong>{item.label}</strong>
                          <span>{item.description}</span>
                        </button>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          ) : null}

          <div
            ref={canvasSurfaceRef}
            className={`canvas-surface ${isCanvasDragging ? 'is-dragging' : ''}`}
            role="img"
            aria-label="workflow-preview-surface"
            onPointerDown={handleCanvasPointerDown}
            onPointerMove={handleCanvasPointerMove}
            onPointerUp={handleCanvasPointerUp}
            onPointerCancel={handleCanvasPointerUp}
            onWheel={handleCanvasWheel}
            onDoubleClick={handleCanvasDoubleClick}
          >
            <div className="canvas-zoom-controls" data-no-canvas-drag="true">
              <button type="button" className="btn btn-subtle" onClick={() => zoomCanvas('out')} aria-label="缩小画布">
                −
              </button>
              <span className="canvas-zoom-value">{zoomPercent}%</span>
              <button type="button" className="btn btn-subtle" onClick={() => zoomCanvas('in')} aria-label="放大画布">
                +
              </button>
              <button type="button" className="btn btn-subtle" onClick={resetCanvasViewport}>
                重置
              </button>
            </div>
            <svg className="canvas-grid canvas-grid-fixed" aria-hidden>
              <defs>
                <pattern id="grid-dot" width="24" height="24" patternUnits="userSpaceOnUse">
                  <circle cx="1" cy="1" r="1" fill="rgba(22, 53, 97, 0.18)" />
                </pattern>
              </defs>
              <rect x="0" y="0" width="100%" height="100%" fill="url(#grid-dot)" />
            </svg>

            <div className="canvas-viewport" style={{ transform: `translate(${canvasOffset.x}px, ${canvasOffset.y}px) scale(${canvasScale})` }}>
              <svg className="canvas-edges" aria-hidden>
                {canvasEdges.map((edge) => (
                  <path key={edge.id} className={`edge edge-${edge.variant}`} d={edge.path} />
                ))}
              </svg>

              <button
                type="button"
                className={`canvas-node node-trigger ${selectedPreviewNode === 'trigger' ? 'is-selected' : ''}`}
                style={{ left: nodeLayouts.trigger.x, top: nodeLayouts.trigger.y }}
                onPointerDown={(event) => handleNodePointerDown('trigger', event)}
                onClick={() => handleCanvasNodeClick('trigger')}
              >
                <strong>{primaryActionName || '添加标记定时'}</strong>
                <span>{primaryActionTypeLabel} · delayed</span>
              </button>

              <button
                type="button"
                className={`canvas-node node-condition ${selectedPreviewNode === 'condition' ? 'is-selected' : ''}`}
                style={{ left: nodeLayouts.condition.x, top: nodeLayouts.condition.y }}
                onPointerDown={(event) => handleNodePointerDown('condition', event)}
                onClick={() => handleCanvasNodeClick('condition')}
              >
                <strong>{primaryConditionName}</strong>
                <span>{primaryConditionSummary}</span>
              </button>

              <button
                type="button"
                className={`canvas-node node-action ${selectedPreviewNode === 'action' ? 'is-selected' : ''}`}
                style={{ left: nodeLayouts.action.x, top: nodeLayouts.action.y }}
                onPointerDown={(event) => handleNodePointerDown('action', event)}
                onClick={handleCanvasAddNodeClick}
              >
                <strong>+</strong>
              </button>

              <button
                type="button"
                className={`canvas-node node-end ${selectedPreviewNode === 'end' ? 'is-selected' : ''}`}
                style={{ left: nodeLayouts.end.x, top: nodeLayouts.end.y }}
                onPointerDown={(event) => handleNodePointerDown('end', event)}
                onClick={() => handleCanvasNodeClick('end')}
              >
                <strong>+</strong>
              </button>
            </div>
          </div>
        </section>

        {isInspectorVisible ? (
          <section className={`builder builder-node-${selectedPreviewNode}`}>
          <section className="editor shell-card compact-editor">
            <header className="config-panel-head">
              <div>
                <h2>节点配置</h2>
                <p>当前选中：{selectedPreviewNodeLabel}</p>
              </div>
            </header>
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

            <form id="workflow-editor-form" ref={editorFormRef} className="editor-form" onSubmit={handleSubmit}>
              {isTriggerNodeSelected ? (
              <section className="wizard-card">
                <header>
                  <h3>自动化名称</h3>
                  <p>先给这条自动化起名字，并确定是否立即启用。</p>
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
              ) : null}

              {isTriggerNodeSelected ? (
              <section className="wizard-card">
                <header>
                  <h3>触发器</h3>
                  <p>先选数据来源，再选在什么事件下触发（新增、更新、删除）。</p>
                </header>

                <label>
                  快速选择已用表格（推荐）
                  <select
                    value={selectedScopePresetKey}
                    onChange={(event) => {
                      const key = event.target.value
                      setSelectedScopePresetKey(key)
                      const preset = scopePresets.find((item) => item.key === key)
                      if (!preset) return
                      updateModel((draft) => {
                        draft.appToken = preset.appToken
                        draft.tableId = preset.tableId
                      })
                    }}
                    disabled={submitting || scopePresets.length === 0}
                  >
                    <option value="">手动填写 appToken/tableId</option>
                    {scopePresets.map((preset) => (
                      <option key={preset.key} value={preset.key}>
                        {preset.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="form-grid two">
                  <label>
                    appToken（应用）
                    <input
                      type="text"
                      value={formModel.appToken}
                      onChange={(event) => updateModel((draft) => void (draft.appToken = event.target.value))}
                      placeholder="KaWjbBv..."
                      disabled={submitting}
                    />
                  </label>
                  <label>
                    tableId（数据表）
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
                  eventTypes（高级输入，可选）
                  <input
                    type="text"
                    value={formModel.eventTypesText}
                    onChange={(event) => updateModel((draft) => void (draft.eventTypesText = event.target.value))}
                    placeholder="record_updated, record_deleted"
                    disabled={submitting}
                  />
                </label>
              </section>
              ) : null}

              {mode === 'visual' ? (
                (isConditionNodeSelected || isActionNodeSelected) ? (
                <section className="wizard-card">
                  <header className="steps-header">
                    <div>
                      <h3>步骤 3：{isConditionNodeSelected ? '条件配置' : '动作配置'}</h3>
                      <p>
                        {isConditionNodeSelected
                          ? '这里只展示条件步骤，先把判断逻辑配置清楚。'
                          : '这里只展示动作步骤，确认要执行的结果。'}
                      </p>
                    </div>
                    <div className="step-create-tools">
                      {isConditionNodeSelected ? (
                        <button
                          type="button"
                          className="btn btn-main"
                          onClick={() => {
                            updateModel((draft) => {
                              const newStep = createDefaultStep('condition')
                              newStep.name = `条件步骤 ${draft.steps.length + 1}`
                              draft.steps.push(newStep)
                            })
                            setActiveConfigSection('condition')
                          }}
                          disabled={submitting}
                        >
                          添加条件步骤
                        </button>
                      ) : (
                        <>
                          <label>
                            动作类型
                            <select
                              value={newStepType}
                              onChange={(event) => setNewStepType(event.target.value as (typeof STEP_TYPE_OPTIONS)[number])}
                              disabled={submitting}
                            >
                              {STEP_TYPE_OPTIONS.filter((stepType) => stepType !== 'condition').map((stepType) => (
                                <option key={stepType} value={stepType}>
                                  {toStepTypeLabel(stepType)}
                                </option>
                              ))}
                            </select>
                          </label>
                          <button
                            type="button"
                            className="btn btn-main"
                            onClick={() => {
                              updateModel((draft) => {
                                const stepType = newStepType === 'condition' ? 'action.custom' : newStepType
                                const newStep = createDefaultStep(stepType)
                                newStep.name = `动作步骤 ${draft.steps.length + 1}`
                                draft.steps.push(newStep)
                              })
                              setActiveConfigSection('action')
                            }}
                            disabled={submitting}
                          >
                            添加动作步骤
                          </button>
                        </>
                      )}
                    </div>
                  </header>

                  <div className="step-toolbar">
                    <p className="assist-tip">当前展示：{isConditionNodeSelected ? '条件步骤' : '动作步骤'}</p>
                  </div>

                  {visibleStepEntries.length === 0 ? (
                    <div className="empty-card">当前阶段暂无步骤，请先添加{isConditionNodeSelected ? '条件' : '动作'}步骤。</div>
                  ) : (
                    <div className="steps-list">
                      {visibleStepEntries.map(({ step, index: stepIndex }) => {
                        const stepTypeLabel = toStepTypeLabel(step.type)

                        return (
                          <article key={`${step.id}-${stepIndex}`} className="step-card">
                            <header className="step-card-head">
                              <div>
                                <p className="step-index">步骤 {stepIndex + 1}</p>
                                <h4>{step.name || `${stepTypeLabel}${stepIndex + 1}`}</h4>
                                <p className="step-type-pill">{stepTypeLabel}</p>
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

                            <div className="form-grid two">
                              <label>
                                步骤名称
                                <input
                                  type="text"
                                  value={step.name}
                                  onChange={(event) =>
                                    updateModel((draft) => void (draft.steps[stepIndex].name = event.target.value))
                                  }
                                  disabled={submitting}
                                />
                              </label>
                              <label>
                                步骤类型
                                <select
                                  value={step.type}
                                  onChange={(event) =>
                                    updateModel((draft) => void (draft.steps[stepIndex].type = event.target.value))
                                  }
                                  disabled={submitting}
                                >
                                  {STEP_TYPE_OPTIONS.map((stepType) => (
                                    <option key={stepType} value={stepType}>
                                      {toStepTypeLabel(stepType)}
                                    </option>
                                  ))}
                                </select>
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

                            <details className="advanced-box">
                              <summary>高级设置（分支 / 守卫 / 模板策略）</summary>

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
                              </div>

                              <div className="form-grid two">
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

                              <label className="switch-line switch-line-tight">
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
                            </details>
                          </article>
                        )
                      })}
                    </div>
                  )}
                </section>
                ) : null
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

              {isEndNodeSelected ? (
              <section className="wizard-card preview-board" aria-live="polite">
                <header>
                  <h3>执行预演摘要</h3>
                  <p>提交前快速确认：触发器、条件和动作是否符合业务预期。</p>
                </header>

                <div className="preview-grid">
                  <div className="preview-item">
                    <h4>触发器</h4>
                    <p>
                      表格 {formModel.appToken || '未填写 appToken'} / {formModel.tableId || '未填写 tableId'}
                    </p>
                    <p>事件：{parseEventTypeTokens(formModel.eventTypesText).join('、') || '未选择触发事件'}</p>
                  </div>

                  <div className="preview-item">
                    <h4>条件步骤</h4>
                    {conditionSteps.length ? (
                      <ul>
                        {conditionSteps.map((step, index) => (
                          <li key={`condition_preview_${step.id}_${index}`}>
                            {(step.name.trim() || `条件步骤${index + 1}`) + '：'} {summarizeCondition(step.conditionConfig)}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>暂无条件步骤</p>
                    )}
                  </div>

                  <div className="preview-item">
                    <h4>动作步骤</h4>
                    {previewLines.filter((line) => line.includes('执行')).length ? (
                      <ul>
                        {previewLines
                          .filter((line) => line.includes('执行'))
                          .map((line, index) => (
                            <li key={`action_preview_${index}`}>{line}</li>
                          ))}
                      </ul>
                    ) : (
                      <p>暂无动作步骤</p>
                    )}
                  </div>
                </div>

                {publishTodoItems.length ? (
                  <div className="assist-error" role="alert">
                    <strong>发布前仍有待完成项：</strong>
                    <ul>
                      {publishTodoItems.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="assist-tip">配置检查通过，可以提交发布。</p>
                )}
              </section>
              ) : null}

              {isEndNodeSelected ? (
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
              ) : null}
            </form>
          </section>
        </section>
        ) : null}
      </main>
    </div>
  )
}

export default App
