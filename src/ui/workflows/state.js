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
          action: 'record_updated',
        },
      },
      steps: [
        {
          id: 'step_notify_1',
          type: 'send-feishu-message',
          name: '发送通知',
          config: {
            message: '检测到多维表格记录变更',
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
