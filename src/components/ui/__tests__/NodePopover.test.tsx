import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { NodePopover } from '@/components/ui/NodePopover'

const mockExecuteAction = vi.fn()
const mockTranslateNodeContent = vi.fn()
const mockCancel = vi.fn()

vi.mock('@/hooks/useAi', () => ({
  useAi: () => ({
    isLoading: false,
    streamingText: '',
    error: null,
    currentAction: null,
    executeAction: mockExecuteAction,
    translateNodeContent: mockTranslateNodeContent,
    cancel: mockCancel,
  }),
}))

vi.mock('@/lib/api-keys', () => ({
  loadApiKeys: vi.fn().mockResolvedValue({
    provider: 'openai',
    openaiKey: 'sk-test',
    anthropicKey: null,
    geminiKey: null,
    openaiBaseUrl: null,
    anthropicBaseUrl: null,
    openaiModel: 'gpt-4o',
    anthropicModel: null,
  }),
  saveApiKeys: vi.fn().mockResolvedValue({ success: true }),
}))

vi.mock('@/stores/useStore', () => ({
  useStore: (sel: any) => sel({ addNode: vi.fn(), addEdge: vi.fn() }),
}))

describe('NodePopover', () => {
  beforeEach(() => {
    mockExecuteAction.mockReset()
    mockTranslateNodeContent.mockReset()
    mockCancel.mockReset()
  })

  it('renders only Translation and Chat actions', async () => {
    const anchor = document.createElement('button')
    document.body.appendChild(anchor)
    ;(anchor as any).getBoundingClientRect = () => ({ top: 10, left: 10, width: 10, height: 10 })

    render(
      <NodePopover
        nodeId="n1"
        nodeType="OBSERVATION"
        isOpen={true}
        onClose={() => {}}
        anchorEl={anchor}
      />
    )

    expect(await screen.findByText('Translation')).toBeInTheDocument()
    expect(screen.getByText('Chat')).toBeInTheDocument()
    expect(screen.queryByText('Summarize')).not.toBeInTheDocument()
    expect(screen.queryByText('Suggest Mechanism')).not.toBeInTheDocument()
    expect(screen.queryByText('Suggest Validation')).not.toBeInTheDocument()
    expect(screen.queryByText('Critique')).not.toBeInTheDocument()
    expect(screen.queryByText('Expand')).not.toBeInTheDocument()
    expect(screen.queryByText('Generate Questions')).not.toBeInTheDocument()
  })

  it('chat action dispatches stemflow:open-chat event', async () => {
    const anchor = document.createElement('button')
    document.body.appendChild(anchor)
    ;(anchor as any).getBoundingClientRect = () => ({ top: 10, left: 10, width: 10, height: 10 })

    const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent')

    render(
      <NodePopover
        nodeId="n1"
        nodeType="OBSERVATION"
        isOpen={true}
        onClose={() => {}}
        anchorEl={anchor}
      />
    )

    fireEvent.click(await screen.findByText('Chat'))
    await waitFor(() => {
      expect(dispatchEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'stemflow:open-chat',
          detail: { nodeId: 'n1' },
        })
      )
    })

    dispatchEventSpy.mockRestore()
  })

  it('translation action opens language dropdown and runs translation', async () => {
    const anchor = document.createElement('button')
    document.body.appendChild(anchor)
    ;(anchor as any).getBoundingClientRect = () => ({ top: 10, left: 10, width: 10, height: 10 })

    render(
      <NodePopover
        nodeId="n1"
        nodeType="OBSERVATION"
        isOpen={true}
        onClose={() => {}}
        anchorEl={anchor}
      />
    )

    fireEvent.click(await screen.findByText('Translation'))
    expect(await screen.findByLabelText('Target language')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Translate'))
    await waitFor(() => {
      expect(mockTranslateNodeContent).toHaveBeenCalledWith('zh-CN')
    })
  })
})
