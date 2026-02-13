import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAi } from '@/hooks/useAi'
import * as apiKeys from '@/lib/api-keys'
import { useAiStore } from '@/stores/useAiStore'
import { useStore } from '@/stores/useStore'
import type { OMVEdge, OMVNode } from '@/types/nodes'

vi.mock('@/lib/api-keys')

const NODE_ID = 'node-1'
const POSITION_OFFSET = { x: 280, y: 0 }

const streamFromStrings = (chunks: string[]) => {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)))
      controller.close()
    },
  })
}

const createBaseNode = () => ({
  id: NODE_ID,
  type: 'OBSERVATION' as const,
  data: { text_content: 'Test observation' },
  position: { x: 100, y: 100 },
})

describe('useAi', () => {
  let mockAddNode: ReturnType<typeof vi.fn<(node: OMVNode) => void>>
  let mockAddEdge: ReturnType<typeof vi.fn<(edge: OMVEdge) => void>>

  beforeEach(() => {
    vi.restoreAllMocks()
    useAiStore.getState().clearNode(NODE_ID)
    mockAddNode = vi.fn<(node: OMVNode) => void>()
    mockAddEdge = vi.fn<(edge: OMVEdge) => void>()

    useStore.setState({
      nodes: [createBaseNode()],
      edges: [],
      addNode: mockAddNode,
      addEdge: mockAddEdge,
    })

    vi.spyOn(apiKeys, 'loadApiKeys').mockResolvedValue({
      provider: 'openai',
      openaiKey: 'sk-test',
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
    })
  })

  it('streams chunks and appends text', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        streamFromStrings([
          'data: {"choices":[{"delta":{"content":"Hello "}}]}\n',
          'data: {"choices":[{"delta":{"content":"World"}}]}\n',
          'data: [DONE]\n',
        ]),
        { status: 200, headers: { 'content-type': 'text/event-stream' } }
      )
    )

    const { result } = renderHook(() => useAi(NODE_ID))

    await act(async () => {
      await result.current.executeAction('summarize')
    })

    expect(useAiStore.getState().streamingText[NODE_ID]).toBe('Hello World')
    expect(useAiStore.getState().isLoading[NODE_ID]).toBe(false)
  })

  it('creates node and edge on completion', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        streamFromStrings([
          'data: {"choices":[{"delta":{"content":"Result"}}]}\n',
          'data: [DONE]\n',
        ]),
        { status: 200, headers: { 'content-type': 'text/event-stream' } }
      )
    )

    const { result } = renderHook(() => useAi(NODE_ID))

    await act(async () => {
      await result.current.executeAction('summarize')
    })

    expect(mockAddNode).toHaveBeenCalledTimes(1)
    const createdNode = mockAddNode.mock.calls[0]?.[0]
    expect(createdNode).toEqual(
      expect.objectContaining({
        type: 'OBSERVATION',
        data: { text_content: 'Result' },
        position: {
          x: 100 + POSITION_OFFSET.x,
          y: 100 + POSITION_OFFSET.y,
        },
      })
    )
    expect(mockAddEdge).toHaveBeenCalledTimes(1)
    expect(mockAddEdge).toHaveBeenCalledWith(
      expect.objectContaining({
        source: NODE_ID,
        target: createdNode.id,
      })
    )
  })

  it('suggest-mechanism creates MECHANISM node', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        streamFromStrings([
          'data: {"choices":[{"delta":{"content":"Mechanism"}}]}\n',
          'data: [DONE]\n',
        ]),
        { status: 200, headers: { 'content-type': 'text/event-stream' } }
      )
    )

    const { result } = renderHook(() => useAi(NODE_ID))

    await act(async () => {
      await result.current.executeAction('suggest-mechanism')
    })

    expect(mockAddNode).toHaveBeenCalledTimes(1)
    const createdNode = mockAddNode.mock.calls[0]?.[0]
    expect(createdNode.type).toBe('MECHANISM')
  })

  it('cancel aborts and stops loading without node creation', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => {
      return new Promise((_resolve, reject) => {
        const signal = init?.signal as AbortSignal | undefined
        if (signal?.aborted) {
          reject(new DOMException('Aborted', 'AbortError'))
          return
        }
        signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'))
        })
      })
    })

    const { result } = renderHook(() => useAi(NODE_ID))

    await act(async () => {
      const promise = result.current.executeAction('summarize')
      await Promise.resolve()
      result.current.cancel()
      await promise
    })

    expect(useAiStore.getState().isLoading[NODE_ID]).toBe(false)
    expect(mockAddNode).not.toHaveBeenCalled()
  })
})
