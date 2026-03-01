/**
 * @vitest-environment jsdom
 */

import { act } from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'

import { useNodeChat } from '@/hooks/useNodeChat'
import * as apiKeys from '@/lib/api-keys'
import * as chatDb from '@/lib/db/chat-db'
import { useStore } from '@/stores/useStore'
import type { OMVNode } from '@/types/nodes'

vi.mock('@/lib/api-keys', () => ({
  loadApiKeys: vi.fn(),
}))

vi.mock('@/lib/db/chat-db', () => ({
  appendTurn: vi.fn(),
  appendVariant: vi.fn(),
  createThreadV2: vi.fn(),
  getActiveThreadId: vi.fn(),
  listThreadsV2: vi.fn(),
  listTurnsWithVariants: vi.fn(),
  setActiveThreadId: vi.fn(),
  setProposalStatus: vi.fn(),
  setSelectedVariant: vi.fn(),
  updateVariant: vi.fn(),
  updateThreadTitle: vi.fn(),
}))

const NODE_ID = 'test-node-1'

const createNode = (): OMVNode => ({
  id: NODE_ID,
  type: 'OBSERVATION',
  data: { text_content: 'Node body content' },
  position: { x: 0, y: 0 },
})

const mockApiKeys = () => {
  const loadApiKeysMock = apiKeys.loadApiKeys as unknown as Mock
  loadApiKeysMock.mockResolvedValue({
    provider: 'openai',
    openaiKey: 'sk-test',
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
    aiStreamingEnabled: false,
  })
}

const baseThreads = [{ id: 'thread-1', nodeId: NODE_ID, title: 'Chat 1', updatedAt: 100, createdAt: 100 }]

describe('useNodeChat v2', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    mockApiKeys()
    useStore.setState({ nodes: [createNode()], edges: [], updateNodeData: vi.fn() })

    ;(chatDb.listThreadsV2 as unknown as Mock).mockResolvedValue(baseThreads)
    ;(chatDb.getActiveThreadId as unknown as Mock).mockResolvedValue('thread-1')
    ;(chatDb.listTurnsWithVariants as unknown as Mock).mockResolvedValue([])
    ;(chatDb.setActiveThreadId as unknown as Mock).mockResolvedValue(undefined)
    ;(chatDb.createThreadV2 as unknown as Mock).mockResolvedValue({
      id: 'thread-new',
      nodeId: NODE_ID,
      title: 'Chat 2',
      updatedAt: 200,
      createdAt: 200,
    })
    ;(chatDb.appendTurn as unknown as Mock).mockResolvedValue({
      id: 'turn-new',
      threadId: 'thread-1',
      seq: 1,
      userText: 'new message',
      userCreatedAt: 500,
      selectedVariantOrdinal: null,
    })
    ;(chatDb.appendVariant as unknown as Mock).mockResolvedValue({
      id: 'variant-new',
      turnId: 'turn-new',
      ordinal: 0,
      status: 'streaming',
      mode: 'answer',
      contentText: '',
      createdAt: 501,
      updatedAt: 501,
    })
    ;(chatDb.updateVariant as unknown as Mock).mockResolvedValue(undefined)
    ;(chatDb.updateThreadTitle as unknown as Mock).mockResolvedValue(undefined)
    ;(chatDb.setSelectedVariant as unknown as Mock).mockResolvedValue(undefined)
    ;(chatDb.setProposalStatus as unknown as Mock).mockResolvedValue(undefined)

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ mode: 'answer', answerText: 'ok' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
  })

  it('loads thread-aware state and supports creating/switching threads', async () => {
    const { result } = renderHook(() => useNodeChat(NODE_ID))

    await waitFor(() => {
      expect(result.current.threads).toHaveLength(1)
      expect(result.current.activeThreadId).toBe('thread-1')
    })

    await act(async () => {
      const createdId = await result.current.startNewThread()
      expect(createdId).toBe('thread-new')
    })

    expect(result.current.activeThreadId).toBe('thread-new')

    await act(async () => {
      await result.current.setActiveThread('thread-1')
    })

    expect((chatDb.setActiveThreadId as unknown as Mock).mock.calls.at(-1)?.[1]).toBe('thread-1')
  })

  it('sendMessage builds history from selected variants only', async () => {
    ;(chatDb.listTurnsWithVariants as unknown as Mock).mockResolvedValue([
      {
        turn: {
          id: 'turn-1',
          threadId: 'thread-1',
          seq: 0,
          userText: 'u0',
          userCreatedAt: 1,
          selectedVariantOrdinal: 1,
        },
        variants: [
          {
            id: 'v0',
            turnId: 'turn-1',
            ordinal: 0,
            status: 'complete',
            mode: 'answer',
            contentText: 'a0',
            createdAt: 1,
            updatedAt: 1,
          },
          {
            id: 'v1',
            turnId: 'turn-1',
            ordinal: 1,
            status: 'complete',
            mode: 'answer',
            contentText: 'a1-selected',
            createdAt: 2,
            updatedAt: 2,
          },
        ],
      },
      {
        turn: {
          id: 'turn-2',
          threadId: 'thread-1',
          seq: 1,
          userText: 'u1',
          userCreatedAt: 3,
          selectedVariantOrdinal: null,
        },
        variants: [
          {
            id: 'v2',
            turnId: 'turn-2',
            ordinal: 0,
            status: 'complete',
            mode: 'answer',
            contentText: 'a2-not-selected',
            createdAt: 3,
            updatedAt: 3,
          },
        ],
      },
    ])

    ;(chatDb.appendTurn as unknown as Mock).mockResolvedValue({
      id: 'turn-new',
      threadId: 'thread-1',
      seq: 2,
      userText: 'new message',
      userCreatedAt: 10,
      selectedVariantOrdinal: null,
    })

    const { result } = renderHook(() => useNodeChat(NODE_ID))

    await waitFor(() => {
      expect(result.current.turns).toHaveLength(2)
    })

    await act(async () => {
      await result.current.sendMessage('new message')
    })

    const body = JSON.parse(((globalThis.fetch as unknown as Mock).mock.calls[0]?.[1] as RequestInit).body as string) as {
      history: Array<{ role: string; content: string }>
    }

    expect(body.history).toEqual([
      { role: 'user', content: 'u0' },
      { role: 'assistant', content: 'a1-selected' },
      { role: 'user', content: 'u1' },
    ])
  })

  it('regenerate older turn adds variant to target only and uses history before target', async () => {
    ;(chatDb.listTurnsWithVariants as unknown as Mock).mockResolvedValue([
      {
        turn: {
          id: 'turn-1',
          threadId: 'thread-1',
          seq: 0,
          userText: 'u0',
          userCreatedAt: 1,
          selectedVariantOrdinal: 0,
        },
        variants: [
          {
            id: 'v1',
            turnId: 'turn-1',
            ordinal: 0,
            status: 'complete',
            mode: 'answer',
            contentText: 'a0',
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      },
      {
        turn: {
          id: 'turn-2',
          threadId: 'thread-1',
          seq: 1,
          userText: 'u1',
          userCreatedAt: 2,
          selectedVariantOrdinal: 0,
        },
        variants: [
          {
            id: 'v2',
            turnId: 'turn-2',
            ordinal: 0,
            status: 'complete',
            mode: 'answer',
            contentText: 'a1',
            createdAt: 2,
            updatedAt: 2,
          },
        ],
      },
      {
        turn: {
          id: 'turn-3',
          threadId: 'thread-1',
          seq: 2,
          userText: 'u2',
          userCreatedAt: 3,
          selectedVariantOrdinal: 0,
        },
        variants: [
          {
            id: 'v3',
            turnId: 'turn-3',
            ordinal: 0,
            status: 'complete',
            mode: 'answer',
            contentText: 'a2',
            createdAt: 3,
            updatedAt: 3,
          },
        ],
      },
    ])

    ;(chatDb.appendVariant as unknown as Mock).mockResolvedValue({
      id: 'v2-r1',
      turnId: 'turn-2',
      ordinal: 1,
      status: 'streaming',
      mode: 'answer',
      contentText: '',
      createdAt: 20,
      updatedAt: 20,
    })

    const { result } = renderHook(() => useNodeChat(NODE_ID))

    await waitFor(() => {
      expect(result.current.turns).toHaveLength(3)
    })

    await act(async () => {
      await result.current.regenerateVariant({ threadId: 'thread-1', turnId: 'turn-2' })
    })

    const body = JSON.parse(((globalThis.fetch as unknown as Mock).mock.calls[0]?.[1] as RequestInit).body as string) as {
      history: Array<{ role: string; content: string }>
    }
    expect(body.history).toEqual([
      { role: 'user', content: 'u0' },
      { role: 'assistant', content: 'a0' },
    ])

    const turn2 = result.current.turns.find((turn) => turn.turnId === 'turn-2')
    const turn3 = result.current.turns.find((turn) => turn.turnId === 'turn-3')
    expect(turn2?.variants).toHaveLength(2)
    expect(turn2?.variants.at(-1)?.variantId).toBe('v2-r1')
    expect(turn2?.selectedVariantOrdinal).toBe(0)
    expect(turn2?.viewingVariantOrdinal).toBe(1)
    expect(turn3?.variants).toHaveLength(1)
    expect(chatDb.setSelectedVariant).not.toHaveBeenCalledWith('turn-2', 1)
  })

  it('setViewingVariant changes visible variant but does not change history context', async () => {
    ;(chatDb.listTurnsWithVariants as unknown as Mock).mockResolvedValue([
      {
        turn: {
          id: 'turn-1',
          threadId: 'thread-1',
          seq: 0,
          userText: 'u0',
          userCreatedAt: 1,
          selectedVariantOrdinal: 0,
        },
        variants: [
          {
            id: 'v0',
            turnId: 'turn-1',
            ordinal: 0,
            status: 'complete',
            mode: 'answer',
            contentText: 'a0-selected',
            createdAt: 1,
            updatedAt: 1,
          },
          {
            id: 'v1',
            turnId: 'turn-1',
            ordinal: 1,
            status: 'complete',
            mode: 'answer',
            contentText: 'a1-view-only',
            createdAt: 2,
            updatedAt: 2,
          },
        ],
      },
    ])

    ;(chatDb.appendTurn as unknown as Mock).mockResolvedValue({
      id: 'turn-new',
      threadId: 'thread-1',
      seq: 1,
      userText: 'next',
      userCreatedAt: 5,
      selectedVariantOrdinal: null,
    })

    const { result } = renderHook(() => useNodeChat(NODE_ID))

    await waitFor(() => {
      expect(result.current.turns).toHaveLength(1)
    })

    act(() => {
      result.current.setViewingVariant({ threadId: 'thread-1', turnId: 'turn-1', ordinal: 1 })
    })

    expect(
      (chatDb.setSelectedVariant as unknown as Mock).mock.calls.some(
        (call) => call[0] === 'turn-1'
      )
    ).toBe(false)
    expect(result.current.turns[0]?.viewingVariantOrdinal).toBe(1)
    expect(result.current.turns[0]?.selectedVariantOrdinal).toBe(0)

    await act(async () => {
      await result.current.sendMessage('next')
    })

    const body = JSON.parse(((globalThis.fetch as unknown as Mock).mock.calls[0]?.[1] as RequestInit).body as string) as {
      history: Array<{ role: string; content: string }>
    }

    expect(body.history).toEqual([
      { role: 'user', content: 'u0' },
      { role: 'assistant', content: 'a0-selected' },
    ])
  })

  it('setSelectedVariant changes future context selection', async () => {
    ;(chatDb.listTurnsWithVariants as unknown as Mock).mockResolvedValue([
      {
        turn: {
          id: 'turn-1',
          threadId: 'thread-1',
          seq: 0,
          userText: 'u0',
          userCreatedAt: 1,
          selectedVariantOrdinal: 0,
        },
        variants: [
          {
            id: 'v0',
            turnId: 'turn-1',
            ordinal: 0,
            status: 'complete',
            mode: 'answer',
            contentText: 'a0-default',
            createdAt: 1,
            updatedAt: 1,
          },
          {
            id: 'v1',
            turnId: 'turn-1',
            ordinal: 1,
            status: 'complete',
            mode: 'answer',
            contentText: 'a1-picked',
            createdAt: 2,
            updatedAt: 2,
          },
        ],
      },
    ])

    ;(chatDb.appendTurn as unknown as Mock).mockResolvedValue({
      id: 'turn-new',
      threadId: 'thread-1',
      seq: 1,
      userText: 'next',
      userCreatedAt: 20,
      selectedVariantOrdinal: null,
    })

    const { result } = renderHook(() => useNodeChat(NODE_ID))

    await waitFor(() => {
      expect(result.current.turns).toHaveLength(1)
    })

    await act(async () => {
      await result.current.setSelectedVariant({ threadId: 'thread-1', turnId: 'turn-1', ordinal: 1 })
    })

    await waitFor(() => {
      expect(result.current.turns[0]?.selectedVariantOrdinal).toBe(1)
    })

    await act(async () => {
      await result.current.sendMessage('next')
    })

    const body = JSON.parse(((globalThis.fetch as unknown as Mock).mock.calls[0]?.[1] as RequestInit).body as string) as {
      history: Array<{ role: string; content: string }>
    }
    expect(body.history).toEqual([
      { role: 'user', content: 'u0' },
      { role: 'assistant', content: 'a1-picked' },
    ])
  })

  it('cancel marks in-flight variant aborted and preserves partial content', async () => {
    ;(apiKeys.loadApiKeys as unknown as Mock).mockResolvedValue({
      provider: 'openai',
      openaiKey: 'sk-test',
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

    ;(chatDb.listTurnsWithVariants as unknown as Mock).mockResolvedValue([])
    ;(chatDb.appendTurn as unknown as Mock).mockResolvedValue({
      id: 'turn-new',
      threadId: 'thread-1',
      seq: 0,
      userText: 'stream me',
      userCreatedAt: 1,
      selectedVariantOrdinal: null,
    })
    ;(chatDb.appendVariant as unknown as Mock).mockResolvedValue({
      id: 'variant-stream',
      turnId: 'turn-new',
      ordinal: 0,
      status: 'streaming',
      mode: 'answer',
      contentText: '',
      createdAt: 1,
      updatedAt: 1,
    })

    vi.spyOn(globalThis, 'fetch').mockImplementation((_, init) => {
      const encoder = new TextEncoder()
      let streamController: ReadableStreamDefaultController<Uint8Array> | null = null
      const signal = init?.signal as AbortSignal

      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          streamController = controller
          controller.enqueue(
            encoder.encode(JSON.stringify({ mode: 'answer', answerText: 'partial-text' }) + '\n')
          )
        },
      })

      signal.addEventListener('abort', () => {
        const err = new Error('Aborted')
        err.name = 'AbortError'
        streamController?.error(err)
      })

      return Promise.resolve(
        new Response(stream, {
          status: 200,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        })
      )
    })

    const { result } = renderHook(() => useNodeChat(NODE_ID))

    await waitFor(() => {
      expect(result.current.turns).toHaveLength(0)
    })

    const sendPromise = result.current.sendMessage('stream me')

    await waitFor(() => {
      const targetTurn = result.current.turns.find((turn) => turn.turnId === 'turn-new')
      expect(targetTurn?.variants[0]?.contentText).toBe('partial-text')
    })

    act(() => {
      result.current.cancel()
    })

    await sendPromise

    expect(chatDb.updateVariant).toHaveBeenCalledWith(
      'variant-stream',
      expect.objectContaining({
        status: 'aborted',
        contentText: 'partial-text',
      })
    )

    await waitFor(() => {
      const targetTurn = result.current.turns.find((turn) => turn.turnId === 'turn-new')
      expect(targetTurn?.variants[0]?.status).toBe('aborted')
      expect(targetTurn?.variants[0]?.contentText).toBe('partial-text')
    })
  })

  it('parses SSE data-prefixed stream chunks', async () => {
    ;(apiKeys.loadApiKeys as unknown as Mock).mockResolvedValue({
      provider: 'openai',
      openaiKey: 'sk-test',
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

    ;(chatDb.listTurnsWithVariants as unknown as Mock).mockResolvedValue([])
    ;(chatDb.appendTurn as unknown as Mock).mockResolvedValue({
      id: 'turn-new',
      threadId: 'thread-1',
      seq: 0,
      userText: 'stream me',
      userCreatedAt: 1,
      selectedVariantOrdinal: null,
    })
    ;(chatDb.appendVariant as unknown as Mock).mockResolvedValue({
      id: 'variant-stream',
      turnId: 'turn-new',
      ordinal: 0,
      status: 'streaming',
      mode: 'answer',
      contentText: '',
      createdAt: 1,
      updatedAt: 1,
    })

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('data: {"mode":"answer","answerText":"sse-ok"}\n\n', {
        status: 200,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      })
    )

    const { result } = renderHook(() => useNodeChat(NODE_ID))

    await waitFor(() => {
      expect(result.current.turns).toHaveLength(0)
    })

    await act(async () => {
      await result.current.sendMessage('stream me')
    })

    await waitFor(() => {
      const targetTurn = result.current.turns.find((turn) => turn.turnId === 'turn-new')
      expect(targetTurn?.variants[0]?.status).toBe('complete')
      expect(targetTurn?.variants[0]?.contentText).toBe('sse-ok')
    })

    expect(result.current.error).toBeNull()
  })
})
