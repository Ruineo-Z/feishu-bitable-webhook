export function createDefaultConfigTemplate() {
  return JSON.stringify(
    {
      id: 'wf_demo_001',
      name: '示例工作流',
      trigger: {
        type: 'bitable.record.changed',
        config: {
          app_token: '',
          table_id: '',
          actions: ['record_updated'],
        },
      },
      steps: [
        {
          id: 'step_condition_1',
          type: 'condition',
          name: '判断状态是否为已完成',
          config: {
            logic: 'AND',
            expressions: [
              {
                field: '状态',
                operator: 'equals',
                value: '已完成',
              },
            ],
          },
          onTrue: 'step_notify_done',
          onFalse: 'step_notify_pending',
        },
        {
          id: 'step_notify_done',
          type: 'action.feishu.message',
          name: '通知完成',
          config: {
            receive_id: 'ou_xxx',
            receive_id_type: 'open_id',
            msg_type: 'text',
            content: '{"text":"记录已完成：${trigger.record.fields.标题}"}',
          },
        },
        {
          id: 'step_notify_pending',
          type: 'action.feishu.message',
          name: '通知待处理',
          config: {
            receive_id: 'ou_xxx',
            receive_id_type: 'open_id',
            msg_type: 'text',
            content: '{"text":"记录未完成：${trigger.record.fields.标题}"}',
          },
        },
      ],
    },
    null,
    2,
  )
}

export function createInitialState() {
  return {
    loading: false,
    error: '',
    feedback: {
      type: 'info',
      message: '准备就绪，开始管理你的工作流。',
    },
    workflows: [],
    pagination: {
      limit: 10,
      offset: 0,
      total: 0,
    },
    filter: {
      isActive: 'all',
    },
    editor: {
      workflowId: null,
      mode: 'create',
    },
  }
}

export function resetEditorState(state) {
  state.editor.workflowId = null
  state.editor.mode = 'create'
}

export function setEditorWorkflow(state, workflowId) {
  state.editor.workflowId = workflowId
  state.editor.mode = 'edit'
}

export function setPagination(state, pagination) {
  state.pagination = {
    ...state.pagination,
    ...pagination,
  }
}
