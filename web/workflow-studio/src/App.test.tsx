import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import type { ApiEnvelope, WorkflowDetail, WorkflowSummary } from './types/workflow'

function okResponse<TData>(data: TData, message = 'ok') {
  const payload: ApiEnvelope<TData> = {
    code: 'OK',
    message,
    data,
  }

  return Promise.resolve({
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify(payload)),
  })
}

function okList(data: WorkflowSummary[], total = data.length) {
  const payload: ApiEnvelope<WorkflowSummary[]> = {
    code: 'OK',
    message: 'list',
    data,
    meta: {
      pagination: {
        total,
        limit: 10,
        offset: 0,
      },
    },
  }

  return Promise.resolve({
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify(payload)),
  })
}

const sampleDetail: WorkflowDetail = {
  id: 'wf_demo_001',
  name: '示例流程',
  is_active: true,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  scope: {
    type: 'table',
    appToken: 'app_token_demo',
    tableId: 'tbl_demo',
    eventTypes: ['record_updated'],
  },
  config: {
    id: 'wf_demo_001',
    name: '示例流程',
    trigger: {
      type: 'lark.bitable.record.changed',
      config: {
        app_token: 'app_token_demo',
        table_id: 'tbl_demo',
        actions: ['record_updated'],
      },
    },
    steps: [
      {
        id: 'step_condition_1',
        type: 'condition',
        config: {
          logic: 'AND',
          expressions: [
            {
              field: '状态',
              operator: 'equals',
              value: '已完成',
              source: 'after',
            },
          ],
        },
        onTrue: 'step_action_notify',
      },
      {
        id: 'step_action_notify',
        type: 'action.feishu.message',
        config: {
          receive_id: 'ou_xxx',
          receive_id_type: 'open_id',
          msg_type: 'text',
          content: '{"text":"hello"}',
        },
      },
    ],
  },
}

describe('Workflow Studio App', () => {
  beforeEach(() => {
    vi.stubGlobal('confirm', vi.fn(() => true))
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('支持模式切换（可视化 -> 高级 -> 可视化）', async () => {
    const fetchMock = vi.fn().mockImplementation(() => okList([], 0))
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('当前没有工作流数据，可先创建一个。')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByLabelText('工作流名称'), { target: { value: '模式切换测试' } })
    fireEvent.change(screen.getByLabelText('appToken'), { target: { value: 'app_token_demo' } })
    fireEvent.change(screen.getByLabelText('tableId'), { target: { value: 'tbl_demo' } })

    fireEvent.click(screen.getByRole('tab', { name: '高级 JSON 模式' }))
    expect(screen.getByText('高级 JSON（DSL）')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: '可视化模式' }))

    await waitFor(() => {
      expect(screen.getByText('步骤 3：步骤配置（可视化）')).toBeInTheDocument()
    })
  })

  it('支持创建工作流提交', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => okList([], 0))
      .mockImplementationOnce(() => okResponse(sampleDetail, 'create'))
      .mockImplementationOnce(() => okList([sampleDetail], 1))

    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('当前没有工作流数据，可先创建一个。')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByLabelText('工作流名称'), { target: { value: '创建测试流程' } })
    fireEvent.change(screen.getByLabelText('appToken'), { target: { value: 'app_token_demo' } })
    fireEvent.change(screen.getByLabelText('tableId'), { target: { value: 'tbl_demo' } })

    fireEvent.click(screen.getByRole('button', { name: '创建工作流' }))

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find((call) => call[0] === '/api/workflows')
      expect(postCall).toBeTruthy()
      expect(postCall?.[1]).toMatchObject({ method: 'POST' })
      expect(String((postCall?.[1] as RequestInit).body)).toContain('创建测试流程')
    })
  })

  it('支持删除工作流', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => okList([sampleDetail], 1))
      .mockImplementationOnce(() => okResponse({ id: sampleDetail.id }, 'delete'))
      .mockImplementationOnce(() => okList([], 0))

    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('示例流程')).toBeInTheDocument()
    })

    const card = screen.getByText('示例流程').closest('article')
    expect(card).toBeTruthy()

    fireEvent.click(within(card as HTMLElement).getByRole('button', { name: '删除' }))

    await waitFor(() => {
      const deleteCall = fetchMock.mock.calls.find(
        (call) => String(call[0]) === `/api/workflows/${encodeURIComponent(sampleDetail.id)}`,
      )
      expect(deleteCall).toBeTruthy()
      expect(deleteCall?.[1]).toMatchObject({ method: 'DELETE' })
    })
  })

  it('支持编辑工作流加载详情', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => okList([sampleDetail], 1))
      .mockImplementationOnce(() => okResponse(sampleDetail, 'detail'))

    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('示例流程')).toBeInTheDocument()
    })

    const card = screen.getByText('示例流程').closest('article')
    expect(card).toBeTruthy()

    fireEvent.click(within(card as HTMLElement).getByRole('button', { name: '编辑' }))

    await waitFor(() => {
      expect(screen.getByText(`编辑工作流（${sampleDetail.id}）`)).toBeInTheDocument()
    })
  })
})
