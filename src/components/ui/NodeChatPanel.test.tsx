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
  threads: Array<{ id: string; title: string; updatedAt: number }>
  activeThreadId: string
  turns: Array<{
    turnId: string
    seq: number
    userText: string
    selectedVariantOrdinal: number | null
    viewingVariantOrdinal: number | null
    variants: Array<{
      variantId: string
      ordinal: number
      status: 'streaming' | 'complete' | 'error' | 'aborted'
      mode: 'answer' | 'proposal'
      contentText: string
      proposal?: {
        title: string
        rationale: string
        content: string
        confidence?: number
        diffSummary?: string
      }
      proposalStatus?: 'pending' | 'accepted' | 'rejected'
    }>
  }>
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
  regenerateVariant: ReturnType<typeof vi.fn>
  setViewingVariant: ReturnType<typeof vi.fn>
  setSelectedVariant: ReturnType<typeof vi.fn>
  setActiveThread: ReturnType<typeof vi.fn>
  startNewThread: ReturnType<typeof vi.fn>
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
  threads: [{ id: 'thread-1', title: 'Chat 1', updatedAt: 1 }],
  activeThreadId: 'thread-1',
  turns: [],
  messages: [],
  isLoading: false,
  error: null,
  pendingProposal: null,
  sendMessage: vi.fn().mockResolvedValue(undefined),
  regenerateVariant: vi.fn().mockResolvedValue(undefined),
  setViewingVariant: vi.fn(),
  setSelectedVariant: vi.fn().mockResolvedValue(undefined),
  setActiveThread: vi.fn().mockResolvedValue(undefined),
  startNewThread: vi.fn().mockResolvedValue('thread-2'),
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

  it('handles close button and escape key without canceling generation', () => {
    const onClose = vi.fn()
    mockHookState = createHookState()
    mockUseNodeChat.mockImplementation(() => mockHookState)

    render(<NodeChatPanel nodeId="node-1" onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: 'Close chat panel' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(mockHookState.cancel).not.toHaveBeenCalled()

    const escapeEvent = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
    })
    window.dispatchEvent(escapeEvent)

    expect(onClose).toHaveBeenCalledTimes(2)
    expect(mockHookState.cancel).not.toHaveBeenCalled()
  })

  it('supports thread selector and new chat action', () => {
    mockHookState = createHookState({
      threads: [
        { id: 'thread-1', title: 'Chat 1', updatedAt: 1 },
        { id: 'thread-2', title: 'Chat 2', updatedAt: 2 },
      ],
      activeThreadId: 'thread-1',
    })
    mockUseNodeChat.mockImplementation(() => mockHookState)

    render(<NodeChatPanel nodeId="node-1" onClose={vi.fn()} />)

    const selector = screen.getByLabelText('Thread history')
    fireEvent.change(selector, { target: { value: 'thread-2' } })
    expect(mockHookState.setActiveThread).toHaveBeenCalledWith('thread-2')

    fireEvent.click(screen.getByRole('button', { name: 'New chat' }))
    expect(mockHookState.startNewThread).toHaveBeenCalledTimes(1)
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
      turns: [
        {
          turnId: 'turn-proposal',
          seq: 0,
          userText: 'Please revise',
          selectedVariantOrdinal: 0,
          viewingVariantOrdinal: 0,
          variants: [
            {
              variantId: 'proposal-1',
              ordinal: 0,
              status: 'complete',
              mode: 'proposal',
              contentText: 'Original line\nNew line\nAnother line',
              proposal: {
                title: 'Improve clarity',
                rationale: 'Improve precision and readability',
                content: 'Original line\nNew line\nAnother line',
              },
              proposalStatus: 'pending',
            },
          ],
        },
      ],
      messages: [{ id: 'proposal-1', role: 'assistant', content: 'Original line\nNew line\nAnother line' }],
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

    expect(mockHookState.acceptProposal).toHaveBeenCalledWith({ variantId: 'proposal-1' })
    expect(mockHookState.rejectProposal).toHaveBeenCalledWith({ variantId: 'proposal-1' })
  })

  it('shows copy/regenerate and variant actions for assistant messages', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, {
      clipboard: { writeText },
    })

    mockHookState = createHookState({
      turns: [
        {
          turnId: 'turn-1',
          seq: 0,
          userText: 'User text',
          selectedVariantOrdinal: 0,
          viewingVariantOrdinal: 0,
          variants: [
            {
              variantId: 'assistant-1',
              ordinal: 0,
              status: 'complete',
              mode: 'answer',
              contentText: 'Assistant v1',
            },
            {
              variantId: 'assistant-2',
              ordinal: 1,
              status: 'complete',
              mode: 'answer',
              contentText: 'Assistant v2',
            },
          ],
        },
      ],
      messages: [{ id: 'assistant-1', role: 'assistant', content: 'Assistant v1' }],
    })
    mockUseNodeChat.mockImplementation(() => mockHookState)

    render(<NodeChatPanel nodeId="node-1" onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Copy message' }))
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('Assistant v1')
    })
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Regenerate response' }))
    expect(mockHookState.regenerateVariant).toHaveBeenCalledWith({
      threadId: 'thread-1',
      turnId: 'turn-1',
      fromVariantId: 'assistant-1',
    })

    fireEvent.change(screen.getByLabelText('1/2'), { target: { value: '1' } })
    expect(mockHookState.setViewingVariant).toHaveBeenCalledWith({
      threadId: 'thread-1',
      turnId: 'turn-1',
      ordinal: 1,
    })

    fireEvent.click(screen.getByRole('button', { name: 'Use for future replies' }))
    expect(mockHookState.setSelectedVariant).toHaveBeenCalledWith({
      threadId: 'thread-1',
      turnId: 'turn-1',
      ordinal: 0,
    })
  })
})
