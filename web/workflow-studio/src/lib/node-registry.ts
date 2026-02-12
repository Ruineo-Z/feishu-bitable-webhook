import type { FormModel } from '../types/workflow'

export type WorkflowNodeCategory = 'trigger' | 'condition' | 'action' | 'end'

export const STEP_TYPE_OPTIONS = [
  'condition',
  'action.bitable.delete',
  'action.bitable.create',
  'action.feishu.message',
  'action.custom',
] as const

export type SupportedStepType = (typeof STEP_TYPE_OPTIONS)[number]

export const STEP_TYPE_LABELS: Record<SupportedStepType, string> = {
  condition: '条件判断',
  'action.bitable.delete': '删除记录',
  'action.bitable.create': '创建记录',
  'action.feishu.message': '发送飞书消息',
  'action.custom': '自定义动作',
}

export type ConfigSectionKey = 'trigger' | 'condition' | 'action' | 'publish'

export interface NodeCatalogItem {
  key: string
  category: WorkflowNodeCategory
  label: string
  description: string
  configSection: ConfigSectionKey
  stepType?: SupportedStepType
  addable: boolean
  suggestedName?: string
}

export const NODE_CATALOG_ITEMS: NodeCatalogItem[] = [
  {
    key: 'trigger.table.changed',
    category: 'trigger',
    label: '表格触发器',
    description: '监听飞书多维表格记录新增/更新/删除。',
    configSection: 'trigger',
    addable: false,
  },
  {
    key: 'condition.branch',
    category: 'condition',
    label: '条件分支（if/else）',
    description: '根据表达式结果进入 onTrue/onFalse 分支。',
    configSection: 'condition',
    stepType: 'condition',
    addable: true,
    suggestedName: '条件判断',
  },
  {
    key: 'action.bitable.create',
    category: 'action',
    label: '创建记录',
    description: '向目标数据表新增一条记录。',
    configSection: 'action',
    stepType: 'action.bitable.create',
    addable: true,
    suggestedName: '创建记录',
  },
  {
    key: 'action.bitable.delete',
    category: 'action',
    label: '删除记录',
    description: '按 record_id 或 filter 删除记录。',
    configSection: 'action',
    stepType: 'action.bitable.delete',
    addable: true,
    suggestedName: '删除记录',
  },
  {
    key: 'action.feishu.message',
    category: 'action',
    label: '发送飞书消息',
    description: '向指定用户发送文本通知。',
    configSection: 'action',
    stepType: 'action.feishu.message',
    addable: true,
    suggestedName: '发送飞书消息',
  },
  {
    key: 'action.custom',
    category: 'action',
    label: '自定义动作',
    description: '保留给高级 JSON 配置与扩展动作。',
    configSection: 'action',
    stepType: 'action.custom',
    addable: true,
    suggestedName: '自定义动作',
  },
  {
    key: 'end.publish',
    category: 'end',
    label: '结束节点',
    description: '用于表示流程完成与发布确认。',
    configSection: 'publish',
    addable: false,
  },
]

export const ADDABLE_NODE_CATALOG_ITEMS = NODE_CATALOG_ITEMS.filter((item) => item.addable)

export function toStepTypeLabel(stepType: string): string {
  return STEP_TYPE_LABELS[stepType as SupportedStepType] || stepType
}

export function isStepTypeSupported(stepType: string): stepType is SupportedStepType {
  return STEP_TYPE_OPTIONS.includes(stepType as SupportedStepType)
}

export function createNodeCatalogGroups(items: NodeCatalogItem[] = NODE_CATALOG_ITEMS): Array<{
  category: WorkflowNodeCategory
  title: string
  items: NodeCatalogItem[]
}> {
  const categoryTitleMap: Record<WorkflowNodeCategory, string> = {
    trigger: '触发器',
    condition: '条件',
    action: '动作',
    end: '结束',
  }

  const groups = new Map<WorkflowNodeCategory, NodeCatalogItem[]>()
  items.forEach((item) => {
    const bucket = groups.get(item.category) || []
    bucket.push(item)
    groups.set(item.category, bucket)
  })

  return (['trigger', 'condition', 'action', 'end'] as WorkflowNodeCategory[])
    .filter((category) => groups.has(category))
    .map((category) => ({
      category,
      title: categoryTitleMap[category],
      items: groups.get(category) || [],
    }))
}

export function getNodeCategoryFromStep(step: FormModel['steps'][number]): WorkflowNodeCategory {
  if (step.type === 'condition') {
    return 'condition'
  }

  return 'action'
}

export function validateStepModel(step: FormModel['steps'][number], index: number): string[] {
  const errors: string[] = []

  if (!isStepTypeSupported(step.type)) {
    errors.push(`步骤 ${index + 1} 类型不受支持：${step.type}`)
  }

  if (!step.id.trim()) {
    errors.push(`步骤 ${index + 1} 的 id 不能为空`)
  }

  if (step.type === 'condition') {
    if (!step.conditionConfig.expressions.length) {
      errors.push(`条件步骤 ${step.id || index + 1} 至少需要 1 条表达式`)
    }
  } else if (!step.configText.trim()) {
    errors.push(`动作步骤 ${step.id || index + 1} 的 config 不能为空`)
  }

  return errors
}

export function validateFormNodeSchema(model: FormModel): string[] {
  const errors: string[] = []
  model.steps.forEach((step, index) => {
    errors.push(...validateStepModel(step, index))
  })
  return errors
}
