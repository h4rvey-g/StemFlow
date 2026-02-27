import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { NodeChatPanel } from './NodeChatPanel'

type MockMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
}

interface MockHookState {
  messages: MockMessage[]
  isLoading: boolean
  error: string | null
  pendingProposal: {
    proposalId: string
    payload: {
      title: string
      rationale: string
      content: string
    }
  } | null
  sendMessage: ReturnType<typeof vi.fn>
  acceptProposal: ReturnType<typeof vi.fn>
  rejectProposal: ReturnType<typeof vi.fn>
  cancel: ReturnType<typeof vi.fn>
}

let mockHookState: MockHookState
const mockUseNodeChat = vi.fn()

let mockStoreState: {
  nodes: Array<{
    id: string
    data: {
      text_content: string
      summary_title?: string
    }
  }>
}

vi.mock('@/hooks/useNodeChat', () => ({
  useNodeChat: (nodeId: string) => mockUseNodeChat(nodeId),
}))

vi.mock('@/stores/useStore', () => ({
  useStore: <T,>(selector: (state: typeof mockStoreState) => T) => selector(mockStoreState),
}))

const createHookState = (overrides?: Partial<MockHookState>): MockHookState => ({
  messages: [],
  isLoading: false,
  error: null,
  pendingProposal: null,
  sendMessage: vi.fn().mockResolvedValue(undefined),
  acceptProposal: vi.fn().mockResolvedValue(undefined),
  rejectProposal: vi.fn().mockResolvedValue(undefined),
  cancel: vi.fn(),
  ...overrides,
})

describe('NodeChatPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''

    mockStoreState = {
      nodes: [
        {
          id: 'node-1',
          data: {
            text_content: 'Original line\nOld line\nAnother line',
            summary_title: 'Test node',
          },
        },
      ],
    }

    mockHookState = createHookState()
    mockUseNodeChat.mockImplementation(() => mockHookState)
  })

  it('returns null and does not call hook for null nodeId', () => {
    render(<NodeChatPanel nodeId={null} onClose={vi.fn()} />)

    expect(screen.queryByTestId('node-chat-panel')).not.toBeInTheDocument()
    expect(mockUseNodeChat).not.toHaveBeenCalled()
  })

  it('renders via portal and calls hook when nodeId exists', () => {
    mockHookState = createHookState({
      messages: [
        { id: 'm1', role: 'user', content: 'Hello' },
        { id: 'm2', role: 'assistant', content: 'Hi there' },
      ],
    })
    mockUseNodeChat.mockImplementation(() => mockHookState)

    render(<NodeChatPanel nodeId="node-1" onClose={vi.fn()} />)

    const panel = screen.getByTestId('node-chat-panel')
    expect(panel).toBeInTheDocument()
    expect(document.body).toContainElement(panel)
    expect(mockUseNodeChat).toHaveBeenCalledWith('node-1')
    expect(screen.getByText('Node Chat')).toBeInTheDocument()
    expect(screen.getByText('Hello')).toBeInTheDocument()
    expect(screen.getByText('Hi there')).toBeInTheDocument()

    const scrollable = panel.querySelector('.overflow-y-auto')
    expect(scrollable).toBeInTheDocument()
  })

  it('handles close button and escape key', () => {
    const onClose = vi.fn()
    mockHookState = createHookState()
    mockUseNodeChat.mockImplementation(() => mockHookState)

    render(<NodeChatPanel nodeId="node-1" onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: 'Close chat panel' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(mockHookState.cancel).toHaveBeenCalledTimes(1)

    const escapeEvent = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
    })
    window.dispatchEvent(escapeEvent)

    expect(onClose).toHaveBeenCalledTimes(2)
    expect(mockHookState.cancel).toHaveBeenCalledTimes(2)
  })

  it('does not close on escape when input is focused', () => {
    const onClose = vi.fn()
    mockHookState = createHookState()
    mockUseNodeChat.mockImplementation(() => mockHookState)

    render(<NodeChatPanel nodeId="node-1" onClose={onClose} />)

    const input = screen.getByPlaceholderText(
      'Ask about this node or request a revision...'
    )
    const escapeEvent = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
    })
    input.dispatchEvent(escapeEvent)

    expect(onClose).not.toHaveBeenCalled()
    expect(mockHookState.cancel).not.toHaveBeenCalled()
  })

  it('disables send button for empty input or loading and submits trimmed message', async () => {
    mockHookState = createHookState()
    mockUseNodeChat.mockImplementation(() => mockHookState)

    render(<NodeChatPanel nodeId="node-1" onClose={vi.fn()} />)

    const input = screen.getByPlaceholderText(
      'Ask about this node or request a revision...'
    ) as HTMLInputElement
    const sendButton = screen.getByRole('button', { name: 'Send' })

    expect(sendButton).toBeDisabled()

    fireEvent.change(input, { target: { value: '  revise this  ' } })
    expect(sendButton).toBeEnabled()

    fireEvent.click(sendButton)

    await waitFor(() => {
      expect(mockHookState.sendMessage).toHaveBeenCalledWith('revise this')
    })
    expect(input.value).toBe('')
  })

  it('shows loading state and disables send while loading', () => {
    mockHookState = createHookState({ isLoading: true })
    mockUseNodeChat.mockImplementation(() => mockHookState)

    render(<NodeChatPanel nodeId="node-1" onClose={vi.fn()} />)

    expect(screen.getByText('Generating response…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled()
  })

  it('renders pending proposal details with diff preview and wires accept/reject', () => {
    mockHookState = createHookState({
      pendingProposal: {
        proposalId: 'proposal-1',
        payload: {
          title: 'Improve clarity',
          rationale: 'Improve precision and readability',
          content: 'Original line\nNew line\nAnother line',
        },
      },
    })
    mockUseNodeChat.mockImplementation(() => mockHookState)

    render(<NodeChatPanel nodeId="node-1" onClose={vi.fn()} />)

    expect(screen.getByText('Pending proposal')).toBeInTheDocument()
    expect(screen.getByText('Improve clarity')).toBeInTheDocument()
    expect(
      screen.getByText('Improve precision and readability')
    ).toBeInTheDocument()
    expect(screen.getByText(/Content preview:/)).toBeInTheDocument()
    expect(screen.getByText('Diff preview')).toBeInTheDocument()
    expect(screen.getByText('- Old line')).toBeInTheDocument()
    expect(screen.getByText('+ New line')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Accept' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))

    expect(mockHookState.acceptProposal).toHaveBeenCalledTimes(1)
    expect(mockHookState.rejectProposal).toHaveBeenCalledTimes(1)
  })
})
