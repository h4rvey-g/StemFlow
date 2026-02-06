import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { NodePopover } from '@/components/ui/NodePopover'

const mockExecuteAction = vi.fn()
const mockCancel = vi.fn()

vi.mock('@/hooks/useAi', () => ({
  useAi: () => ({
    isLoading: false,
    streamingText: '',
    error: null,
    currentAction: null,
    executeAction: mockExecuteAction,
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
  it('shows Suggest Mechanism only for Observation nodes', async () => {
    const anchor = document.createElement('button')
    document.body.appendChild(anchor)
    ;(anchor as any).getBoundingClientRect = () => ({ top: 10, left: 10, width: 10, height: 10 })

    const onClose = vi.fn()

    const { rerender } = render(
      <NodePopover
        nodeId="n1"
        nodeType="OBSERVATION"
        isOpen={true}
        onClose={onClose}
        anchorEl={anchor}
      />
    )

    expect(await screen.findByText('Suggest Mechanism')).toBeInTheDocument()

    rerender(
      <NodePopover
        nodeId="n1"
        nodeType="MECHANISM"
        isOpen={true}
        onClose={onClose}
        anchorEl={anchor}
      />
    )

    expect(screen.queryByText('Suggest Mechanism')).toBeNull()
  })

  it('clicking an action calls executeAction', async () => {
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

    fireEvent.click(await screen.findByText('Summarize'))
    await waitFor(() => {
      expect(mockExecuteAction).toHaveBeenCalledWith('summarize', undefined, { createNodeOnComplete: false })
    })
  })
})
