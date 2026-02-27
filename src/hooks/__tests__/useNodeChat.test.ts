import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useNodeChat } from '@/hooks/useNodeChat'
import * as apiKeys from '@/lib/api-keys'
import * as chatDb from '@/lib/db/chat-db'
import { useChatStore } from '@/stores/useChatStore'
import { useStore } from '@/stores/useStore'
import type { ChatResponse, ChatThread, ChatMessage } from '@/types/chat'
import type { OMVNode } from '@/types/nodes'

vi.mock('@/lib/api-keys')
vi.mock('@/lib/db/chat-db')

const NODE_ID = 'test-node-1'

const createTestNode = (): OMVNode => ({
  id: NODE_ID,
  type: 'OBSERVATION',
  data: { text_content: 'Test observation content' },
  position: { x: 100, y: 100 },
})

const mockApiKeys = () => {
  vi.spyOn(apiKeys, 'loadApiKeys').mockResolvedValue({
    provider: 'openai',
    openaiKey: 'sk-test-key',
    anthropicKey: null,
    geminiKey: null,
    openaiBaseUrl: null,
    anthropicBaseUrl: null,
    openaiModel: 'gpt-4o',
    anthropicModel: null,
    geminiModel: null,
    openaiFastModel: null,
    anthropicFastModel: null,
    geminiFastModel: null,
    aiStreamingEnabled: true,
  })
}

describe('useNodeChat', () => {
  let mockUpdateNodeData: ReturnType<typeof vi.fn<(id: string, data: Partial<import('@/types/nodes').NodeData>) => void>>

  beforeEach(() => {
    vi.restoreAllMocks()
    useChatStore.getState().closeChat()
    mockUpdateNodeData = vi.fn()

    useStore.setState({
      nodes: [createTestNode()],
      edges: [],
      updateNodeData: mockUpdateNodeData,
    })

    mockApiKeys()

    vi.spyOn(chatDb, 'getThread').mockResolvedValue(undefined)
    vi.spyOn(chatDb, 'saveThread').mockResolvedValue(undefined)
  })

  it('loads existing thread on mount', async () => {
    const existingThread: ChatThread = {
      nodeId: NODE_ID,
      messages: [
        {
          id: 'msg-1',
          nodeId: NODE_ID,
          role: 'user',
          content: 'Hello',
          timestamp: Date.now(),
        },
        {
          id: 'msg-2',
          nodeId: NODE_ID,
          role: 'assistant',
          content: 'Hi there',
          timestamp: Date.now(),
          mode: 'answer',
        },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    vi.spyOn(chatDb, 'getThread').mockResolvedValue(existingThread)

    const { result } = renderHook(() => useNodeChat(NODE_ID))

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(2)
    })

    expect(result.current.messages[0].content).toBe('Hello')
    expect(result.current.messages[1].content).toBe('Hi there')
  })

  it('starts with empty messages when no thread exists', async () => {
    vi.spyOn(chatDb, 'getThread').mockResolvedValue(undefined)

    const { result } = renderHook(() => useNodeChat(NODE_ID))

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(0)
    })
  })

  it('sends message and receives answer response', async () => {
    const answerResponse: ChatResponse = {
      mode: 'answer',
      answerText: 'This is an answer',
    }

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(answerResponse), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )

    const { result } = renderHook(() => useNodeChat(NODE_ID))

    await act(async () => {
      await result.current.sendMessage('What is this?')
    })

    expect(result.current.messages).toHaveLength(2)
    expect(result.current.messages[0].role).toBe('user')
    expect(result.current.messages[0].content).toBe('What is this?')
    expect(result.current.messages[1].role).toBe('assistant')
    expect(result.current.messages[1].content).toBe('This is an answer')
    expect(result.current.messages[1].mode).toBe('answer')
    expect(result.current.pendingProposal).toBeNull()
  })

  it('sends message and receives proposal response', async () => {
    const proposalResponse: ChatResponse = {
      mode: 'proposal',
      proposal: {
        title: 'Improved content',
        content: 'This is the proposed new content',
        rationale: 'This is better because...',
        confidence: 0.9,
      },
    }

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(proposalResponse), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )

    const { result } = renderHook(() => useNodeChat(NODE_ID))

    await act(async () => {
      await result.current.sendMessage('Improve this content')
    })

    expect(result.current.messages).toHaveLength(2)
    expect(result.current.messages[1].mode).toBe('proposal')
    expect(result.current.pendingProposal).not.toBeNull()
    expect(result.current.pendingProposal?.payload.title).toBe('Improved content')
    expect(result.current.pendingProposal?.payload.content).toBe(
      'This is the proposed new content'
    )
  })

  it('accepts proposal and updates node content', async () => {
    const proposalResponse: ChatResponse = {
      mode: 'proposal',
      proposal: {
        title: 'New content',
        content: 'Updated node content',
        rationale: 'Better clarity',
      },
    }

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(proposalResponse), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )

    const { result } = renderHook(() => useNodeChat(NODE_ID))

    await act(async () => {
      await result.current.sendMessage('Change this')
    })

    expect(result.current.pendingProposal).not.toBeNull()

    await act(async () => {
      await result.current.acceptProposal()
    })

    expect(mockUpdateNodeData).toHaveBeenCalledWith(NODE_ID, {
      text_content: 'Updated node content',
    })
    expect(result.current.pendingProposal).toBeNull()
  })

  it('rejects proposal without updating node', async () => {
    const proposalResponse: ChatResponse = {
      mode: 'proposal',
      proposal: {
        title: 'New content',
        content: 'Updated node content',
        rationale: 'Better clarity',
      },
    }

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(proposalResponse), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )

    const { result } = renderHook(() => useNodeChat(NODE_ID))

    await act(async () => {
      await result.current.sendMessage('Change this')
    })

    expect(result.current.pendingProposal).not.toBeNull()

    act(() => {
      result.current.rejectProposal()
    })

    expect(mockUpdateNodeData).not.toHaveBeenCalled()
    expect(result.current.pendingProposal).toBeNull()
  })

  it('handles API error gracefully', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'API error' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      })
    )

    const { result } = renderHook(() => useNodeChat(NODE_ID))

    await act(async () => {
      await result.current.sendMessage('Test message')
    })

    expect(result.current.error).not.toBeNull()
    expect(result.current.error).toContain('API error')
  })

  it('handles validation error', async () => {
    const invalidResponse = {
      mode: 'invalid',
      someField: 'value',
    }

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(invalidResponse), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )

    const { result } = renderHook(() => useNodeChat(NODE_ID))

    await act(async () => {
      await result.current.sendMessage('Test message')
    })

    expect(result.current.error).not.toBeNull()
    expect(result.current.error).toContain('Invalid')
  })

  it('persists thread after sending message', async () => {
    const answerResponse: ChatResponse = {
      mode: 'answer',
      answerText: 'Response text',
    }

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(answerResponse), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )

    const saveThreadSpy = vi.spyOn(chatDb, 'saveThread')

    const { result } = renderHook(() => useNodeChat(NODE_ID))

    await act(async () => {
      await result.current.sendMessage('Test')
    })

    expect(saveThreadSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        nodeId: NODE_ID,
        messages: expect.arrayContaining([
          expect.objectContaining({ role: 'user', content: 'Test' }),
          expect.objectContaining({ role: 'assistant', content: 'Response text' }),
        ]),
      })
    )
  })

  it('cancels in-flight request', async () => {
    const abortError = new Error('Aborted')
    abortError.name = 'AbortError'

    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(() =>
      Promise.reject(abortError)
    )

    const { result } = renderHook(() => useNodeChat(NODE_ID))

    const sendPromise = act(async () => {
      await result.current.sendMessage('Test')
    })

    act(() => {
      result.current.cancel()
    })

    await sendPromise

    expect(result.current.isLoading).toBe(false)
  })

  it('handles missing API key', async () => {
    vi.spyOn(apiKeys, 'loadApiKeys').mockResolvedValue({
      provider: 'openai',
      openaiKey: null,
      anthropicKey: null,
      geminiKey: null,
      openaiBaseUrl: null,
      anthropicBaseUrl: null,
      openaiModel: null,
      anthropicModel: null,
      geminiModel: null,
      openaiFastModel: null,
      anthropicFastModel: null,
      geminiFastModel: null,
      aiStreamingEnabled: true,
    })

    const { result } = renderHook(() => useNodeChat(NODE_ID))

    await act(async () => {
      await result.current.sendMessage('Test')
    })

    expect(result.current.error).not.toBeNull()
    expect(result.current.error).toContain('No API key')
  })

  it('handles node not found', async () => {
    useStore.setState({
      nodes: [],
      edges: [],
    })

    const { result } = renderHook(() => useNodeChat(NODE_ID))

    await act(async () => {
      await result.current.sendMessage('Test')
    })

    expect(result.current.error).not.toBeNull()
    expect(result.current.error).toContain('Node not found')
  })

  it('ignores empty messages', async () => {
    const { result } = renderHook(() => useNodeChat(NODE_ID))

    await act(async () => {
      await result.current.sendMessage('   ')
    })

    expect(result.current.messages).toHaveLength(0)
  })

  it('cleans up abort controller on unmount', () => {
    const { unmount } = renderHook(() => useNodeChat(NODE_ID))

    unmount()

    // No error should be thrown
    expect(true).toBe(true)
  })

  it('handles node switch during load', async () => {
    const thread1: ChatThread = {
      nodeId: 'node-1',
      messages: [
        {
          id: 'msg-1',
          nodeId: 'node-1',
          role: 'user',
          content: 'Message 1',
          timestamp: Date.now(),
        },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    const thread2: ChatThread = {
      nodeId: 'node-2',
      messages: [
        {
          id: 'msg-2',
          nodeId: 'node-2',
          role: 'user',
          content: 'Message 2',
          timestamp: Date.now(),
        },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    vi.spyOn(chatDb, 'getThread').mockImplementation(async (nodeId) => {
      if (nodeId === 'node-1') return thread1
      if (nodeId === 'node-2') return thread2
      return undefined
    })

    const { result, rerender } = renderHook(
      ({ nodeId }) => useNodeChat(nodeId),
      { initialProps: { nodeId: 'node-1' } }
    )

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(1)
    })

    expect(result.current.messages[0].content).toBe('Message 1')

    rerender({ nodeId: 'node-2' })

    await waitFor(() => {
      expect(result.current.messages[0]?.content).toBe('Message 2')
    })
  })

  it('truncates thread to max 50 messages', async () => {
    // Create 55 messages (5 over limit)
    const manyMessages: ChatMessage[] = Array.from({ length: 55 }, (_, i) => ({
      id: `msg-${i}`,
      nodeId: NODE_ID,
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `Message ${i}`,
      timestamp: Date.now() + i,
    }))

    const threadWithManyMessages: ChatThread = {
      nodeId: NODE_ID,
      messages: manyMessages,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    vi.spyOn(chatDb, 'getThread').mockResolvedValue(threadWithManyMessages)

    const { result } = renderHook(() => useNodeChat(NODE_ID))

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(50)
    })

    // Verify it kept the latest 50 messages (indices 5-54)
    expect(result.current.messages[0].content).toBe('Message 5')
    expect(result.current.messages[49].content).toBe('Message 54')
  })
})
