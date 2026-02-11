export type WorkflowEventType = 'record_created' | 'record_updated' | 'record_deleted'
export type ConditionSource = 'before' | 'after'
export type WorkflowTemplatePolicy = 'fail' | 'skip'

export interface WorkflowScope {
  type: 'table'
  appToken: string
  tableId: string
  eventTypes?: WorkflowEventType[]
}

export interface WorkflowConditionExpression {
  field: string
  operator: string
  value?: unknown
  source?: ConditionSource
}

export interface WorkflowCondition {
  logic: 'AND' | 'OR'
  expressions: WorkflowConditionExpression[]
}

export interface WorkflowTrigger {
  type: string
  config: Record<string, unknown>
}

export interface WorkflowStep {
  id: string
  type: string
  name?: string
  config: Record<string, unknown>
  when?: WorkflowCondition
  templatePolicy?: WorkflowTemplatePolicy
  next?: string
  onTrue?: string
  onFalse?: string
}

export interface WorkflowConfig {
  id: string
  name: string
  trigger: WorkflowTrigger
  steps: WorkflowStep[]
}

export interface WorkflowSummary {
  id: string
  name: string
  config?: WorkflowConfig
  is_active: boolean
  scope: WorkflowScope
  created_at: string
  updated_at: string
}

export interface WorkflowDetail extends WorkflowSummary {
  config: WorkflowConfig
}

export interface ApiEnvelope<TData> {
  code: string
  message: string
  data: TData
  meta?: {
    pagination?: {
      total: number
      limit: number
      offset: number
    }
  }
  details?: unknown
}

export interface ExpressionFormModel {
  id: string
  field: string
  operator: string
  valueText: string
  source: ConditionSource
}

export interface ConditionFormModel {
  logic: 'AND' | 'OR'
  expressions: ExpressionFormModel[]
}

export interface StepFormModel {
  id: string
  type: string
  name: string
  configText: string
  conditionConfig: ConditionFormModel
  whenEnabled: boolean
  whenCondition: ConditionFormModel
  templatePolicy: '' | WorkflowTemplatePolicy
  next: string
  onTrue: string
  onFalse: string
}

export interface FormModel {
  name: string
  isActive: boolean
  scopeType: 'table'
  appToken: string
  tableId: string
  eventTypesText: string
  configId: string
  steps: StepFormModel[]
}

export interface AdapterError {
  code: 'MODEL_INVALID' | 'DSL_INVALID' | 'DSL_UNSUPPORTED' | 'DSL_SCOPE_MISSING'
  message: string
}

export interface DecodeResult {
  supported: boolean
  model: FormModel
  warning?: AdapterError
}

export interface EncodeResult {
  scope: WorkflowScope
  config: WorkflowConfig
}
