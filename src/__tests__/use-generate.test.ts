import { act } from 'react'
import { renderHook } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useGenerate } from '@/hooks/useGenerate'
import { useStore } from '@/stores/useStore'
import * as apiKeys from '@/lib/api-keys'
import * as aiService from '@/lib/ai-service'
import * as graph from '@/lib/graph'

vi.mock('@/lib/api-keys')
vi.mock('@/lib/ai-service')
vi.mock('@/lib/graph')

const MOCK_API_KEYS = {
  provider: 'openai' as const,
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
  aiStreamingEnabled: true,
}

const MOCK_ANCESTRY = [
  {
    id: 'node-1',
    type: 'OBSERVATION' as const,
    data: { text_content: 'Test observation' },
    position: { x: 100, y: 100 },
  },
]

const MOCK_GHOST = {
  id: 'ghost-1',
  type: 'GHOST' as const,
  position: { x: 480, y: 100 },
  data: {
    summary_title: 'Mechanism summary',
    suggestedType: 'MECHANISM' as const,
    parentId: 'node-1',
    ghostId: 'ghost-1',
    plannerDirection: {
      id: 'dir-1',
      summary_title: 'Mechanism summary',
      suggestedType: 'MECHANISM' as const,
      searchQuery: 'query-1',
      sourceNodeId: 'node-1',
    },
    generationStatus: 'pending' as const,
    text_content: undefined,
  },
}

const MOCK_GHOST_2 = {
  id: 'ghost-2',
  type: 'GHOST' as const,
  position: { x: 560, y: 100 },
  data: {
    summary_title: 'Validation summary',
    suggestedType: 'VALIDATION' as const,
    parentId: 'node-1',
    ghostId: 'ghost-2',
    plannerDirection: {
      id: 'dir-2',
      summary_title: 'Validation summary',
      suggestedType: 'VALIDATION' as const,
      searchQuery: 'query-2',
      sourceNodeId: 'node-1',
    },
    generationStatus: 'pending' as const,
    text_content: undefined,
  },
}

type GeneratedStep = {
  type: 'OBSERVATION' | 'MECHANISM' | 'VALIDATION'
  text_content: string
  summary_title: string
  citations: never[]
}

const createDeferred = <T,>() => {
  let resolve: ((value: T) => void) | undefined
  let reject: ((reason?: unknown) => void) | undefined

  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  if (!resolve || !reject) {
    throw new Error('Failed to initialize deferred promise')
  }

  return { promise, resolve, reject }
}

describe('useGenerate', () => {
  const mockSetGhostNodes = vi.fn()
  const mockSetGhostSuggestions = vi.fn()
  const mockSetIsGenerating = vi.fn()
  const mockSetAiError = vi.fn()
  const mockCreatePendingNodeFromGhost = vi.fn()
  const mockHydratePendingNode = vi.fn()
  const mockUpdatePendingNodeStreamingText = vi.fn()
  const mockMarkPendingNodeError = vi.fn()
  const mockRetryPendingNodeGeneration = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    useStore.setState({
      nodes: [
        {
          id: 'node-1',
          type: 'OBSERVATION',
          data: { text_content: 'Test observation' },
          position: { x: 100, y: 100 },
        },
      ],
      edges: [],
      ghostNodes: [MOCK_GHOST],
      ghostEdges: [],
      globalGoal: 'Test goal',
      setGhostNodes: mockSetGhostNodes,
      setGhostSuggestions: mockSetGhostSuggestions,
      setIsGenerating: mockSetIsGenerating,
      setAiError: mockSetAiError,
      isGenerating: false,
      createPendingNodeFromGhost: mockCreatePendingNodeFromGhost,
      hydratePendingNode: mockHydratePendingNode,
      updatePendingNodeStreamingText: mockUpdatePendingNodeStreamingText,
      markPendingNodeError: mockMarkPendingNodeError,
      retryPendingNodeGeneration: mockRetryPendingNodeGeneration,
    })
  })

  it('maps planner previews to ghosts', async () => {
    vi.spyOn(apiKeys, 'loadApiKeys').mockResolvedValue(MOCK_API_KEYS)
    vi.spyOn(graph, 'getNodeAncestry').mockReturnValue(MOCK_ANCESTRY)
    vi.spyOn(graph, 'buildNodeSuggestionContext').mockReturnValue([])

    vi.spyOn(aiService, 'planNextDirections').mockResolvedValue([
      {
        id: 'planner-ghost-1',
        summary_title: 'Mechanism summary',
        suggestedType: 'MECHANISM',
        searchQuery: 'query-1',
        sourceNodeId: 'node-1',
      },
      {
        id: 'planner-ghost-2',
        summary_title: 'Validation summary',
        suggestedType: 'VALIDATION',
        searchQuery: 'query-2',
        sourceNodeId: 'node-1',
      },
      {
        id: 'planner-ghost-3',
        summary_title: 'Observation summary',
        suggestedType: 'OBSERVATION',
        searchQuery: 'query-3',
        sourceNodeId: 'node-1',
      },
    ])

    const { result } = renderHook(() => useGenerate())

    await act(async () => {
      await result.current.generate('node-1')
    })

    expect(mockSetIsGenerating).toHaveBeenCalledWith(true)
    expect(mockSetAiError).toHaveBeenCalledWith(null)
    expect(apiKeys.loadApiKeys).toHaveBeenCalled()
    expect(graph.getNodeAncestry).toHaveBeenCalled()
    expect(aiService.planNextDirections).toHaveBeenCalledWith(
      expect.any(Array),
      'Test goal',
      'openai',
      'sk-test',
      null,
      null,
      []
    )

    const [ghostNodes, ghostEdges] = mockSetGhostSuggestions.mock.calls[0]
    expect(ghostNodes).toHaveLength(3)
    expect(ghostEdges).toHaveLength(3)

    const firstGhost = ghostNodes[0]
    expect(firstGhost.type).toBe('GHOST')
    expect(firstGhost.position).toEqual({ x: 480, y: 100 })
    expect(firstGhost.data.parentId).toBe('node-1')
    expect(firstGhost.data.suggestedType).toBe('MECHANISM')
    expect(firstGhost.data.summary_title).toBe('Mechanism summary')
    expect(firstGhost.data.text_content).toBeUndefined()
    expect(firstGhost.data.plannerDirection).toEqual(
      expect.objectContaining({
        summary_title: 'Mechanism summary',
        suggestedType: 'MECHANISM',
        searchQuery: 'query-1',
        sourceNodeId: 'node-1',
      })
    )

    expect(mockSetGhostSuggestions).toHaveBeenCalledTimes(1)
    expect(mockSetIsGenerating).toHaveBeenCalledWith(false)
  })

  it('sets aiError and avoids ghosts when planner fails', async () => {
    vi.spyOn(apiKeys, 'loadApiKeys').mockResolvedValue(MOCK_API_KEYS)
    vi.spyOn(graph, 'getNodeAncestry').mockReturnValue(MOCK_ANCESTRY)
    vi.spyOn(graph, 'buildNodeSuggestionContext').mockReturnValue([])
    vi.spyOn(aiService, 'planNextDirections').mockRejectedValue(new Error('Planner failed'))

    const { result } = renderHook(() => useGenerate())

    await act(async () => {
      await result.current.generate('node-1')
    })

    expect(mockSetGhostSuggestions).not.toHaveBeenCalled()
    expect(mockSetAiError).toHaveBeenCalledWith('Planner failed')
    expect(mockSetIsGenerating).toHaveBeenCalledWith(false)
  })

  it('handles missing API keys', async () => {
    vi.spyOn(apiKeys, 'loadApiKeys').mockResolvedValue({ ...MOCK_API_KEYS, openaiKey: null })

    const { result } = renderHook(() => useGenerate())

    await act(async () => {
      await result.current.generate('node-1')
    })

    expect(mockSetAiError).toHaveBeenCalledWith(null)
    expect(mockSetAiError).toHaveBeenLastCalledWith('No API key found. Please configure settings.')
    expect(mockSetIsGenerating).toHaveBeenCalledWith(false)
  })

  it('handles AI service errors', async () => {
    vi.spyOn(apiKeys, 'loadApiKeys').mockResolvedValue(MOCK_API_KEYS)
    vi.spyOn(aiService, 'planNextDirections').mockRejectedValue(new Error('AI Error'))
    vi.spyOn(graph, 'buildNodeSuggestionContext').mockReturnValue([])

    const { result } = renderHook(() => useGenerate())

    await act(async () => {
      await result.current.generate('node-1')
    })

    expect(mockSetAiError).toHaveBeenCalledWith('AI Error')
    expect(mockSetIsGenerating).toHaveBeenCalledWith(false)
  })

  describe('acceptGhost', () => {
    beforeEach(() => {
      vi.spyOn(apiKeys, 'loadApiKeys').mockResolvedValue(MOCK_API_KEYS)
      vi.spyOn(graph, 'getNodeAncestry').mockReturnValue(MOCK_ANCESTRY)
      vi.spyOn(graph, 'buildNodeSuggestionContext').mockReturnValue([])
    })

    it('success: creates pending node, calls generateStepFromDirection, hydrates on success', async () => {
      mockCreatePendingNodeFromGhost.mockReturnValue('pending-node-1')
      vi.spyOn(aiService, 'generateStepFromDirection').mockResolvedValue({
        type: 'MECHANISM',
        text_content: 'Full mechanism content',
        summary_title: 'Mechanism summary',
        citations: [],
      })

      const { result } = renderHook(() => useGenerate())

      await act(async () => {
        await result.current.acceptGhost('ghost-1')
      })

      expect(mockCreatePendingNodeFromGhost).toHaveBeenCalledWith('ghost-1')
      expect(aiService.generateStepFromDirection).toHaveBeenCalledWith(
        MOCK_GHOST.data.plannerDirection,
        MOCK_ANCESTRY,
        'Test goal',
        'openai',
        'sk-test',
        null,
        null,
        [],
        expect.objectContaining({
          onStreamingText: expect.any(Function),
        })
      )
      expect(mockHydratePendingNode).toHaveBeenCalledWith('pending-node-1', {
        text_content: 'Full mechanism content',
        summary_title: 'Mechanism summary',
        citations: [],
      })
      expect(mockMarkPendingNodeError).not.toHaveBeenCalled()
    })

    it('streams partial text into pending node before final hydration', async () => {
      mockCreatePendingNodeFromGhost.mockReturnValue('pending-node-1')
      vi.spyOn(aiService, 'generateStepFromDirection').mockImplementation(async (...args: unknown[]) => {
        const options = args[8] as { onStreamingText?: (textContent: string) => void } | undefined
        options?.onStreamingText?.('Partial text')
        options?.onStreamingText?.('Partial text expanded')

        return {
          type: 'MECHANISM',
          text_content: 'Final mechanism content',
          summary_title: 'Mechanism summary',
          citations: [],
        }
      })

      const { result } = renderHook(() => useGenerate())

      await act(async () => {
        await result.current.acceptGhost('ghost-1')
      })

      expect(mockUpdatePendingNodeStreamingText).toHaveBeenCalledWith('pending-node-1', 'Partial text')
      expect(mockUpdatePendingNodeStreamingText).toHaveBeenCalledWith('pending-node-1', 'Partial text expanded')
      expect(mockHydratePendingNode).toHaveBeenCalledWith('pending-node-1', {
        text_content: 'Final mechanism content',
        summary_title: 'Mechanism summary',
        citations: [],
      })
    })

    it('acceptAllGhosts triggers generation for each current ghost', async () => {
      useStore.setState({ ghostNodes: [MOCK_GHOST, MOCK_GHOST_2] })

      mockCreatePendingNodeFromGhost.mockImplementation((ghostId: string) => {
        if (ghostId === 'ghost-1') return 'pending-node-1'
        if (ghostId === 'ghost-2') return 'pending-node-2'
        return null
      })

      vi.spyOn(aiService, 'generateStepFromDirection')
        .mockResolvedValueOnce({
          type: 'MECHANISM',
          text_content: 'Mechanism content',
          summary_title: 'Mechanism summary',
          citations: [],
        })
        .mockResolvedValueOnce({
          type: 'VALIDATION',
          text_content: 'Validation content',
          summary_title: 'Validation summary',
          citations: [],
        })

      const { result } = renderHook(() => useGenerate())

      await act(async () => {
        await result.current.acceptAllGhosts()
      })

      expect(mockCreatePendingNodeFromGhost).toHaveBeenCalledTimes(2)
      expect(mockCreatePendingNodeFromGhost).toHaveBeenNthCalledWith(1, 'ghost-1')
      expect(mockCreatePendingNodeFromGhost).toHaveBeenNthCalledWith(2, 'ghost-2')

      expect(aiService.generateStepFromDirection).toHaveBeenCalledTimes(2)
      expect(mockHydratePendingNode).toHaveBeenCalledWith('pending-node-1', {
        text_content: 'Mechanism content',
        summary_title: 'Mechanism summary',
        citations: [],
      })
      expect(mockHydratePendingNode).toHaveBeenCalledWith('pending-node-2', {
        text_content: 'Validation content',
        summary_title: 'Validation summary',
        citations: [],
      })
    })

    it('multi-accept concurrent success: two quick accepts create independent pending hydrations', async () => {
      const staleAcceptReadyGhosts = [MOCK_GHOST, MOCK_GHOST_2]
      useStore.setState({ ghostNodes: [MOCK_GHOST] })

      const { result } = renderHook(() => useGenerate())
      const staleAcceptGhost = result.current.acceptGhost

      useStore.setState({ ghostNodes: staleAcceptReadyGhosts })

      mockCreatePendingNodeFromGhost.mockImplementation((ghostId: string) => {
        if (ghostId === 'ghost-1') return 'pending-node-1'
        if (ghostId === 'ghost-2') return 'pending-node-2'
        return null
      })

      vi.spyOn(aiService, 'generateStepFromDirection')
        .mockResolvedValueOnce({
          type: 'MECHANISM',
          text_content: 'Mechanism content',
          summary_title: 'Mechanism summary',
          citations: [],
        })
        .mockResolvedValueOnce({
          type: 'VALIDATION',
          text_content: 'Validation content',
          summary_title: 'Validation summary',
          citations: [],
        })

      await act(async () => {
        await Promise.all([
          staleAcceptGhost('ghost-1'),
          staleAcceptGhost('ghost-2'),
        ])
      })

      expect(mockCreatePendingNodeFromGhost).toHaveBeenCalledTimes(2)
      expect(mockCreatePendingNodeFromGhost).toHaveBeenNthCalledWith(1, 'ghost-1')
      expect(mockCreatePendingNodeFromGhost).toHaveBeenNthCalledWith(2, 'ghost-2')

      expect(mockHydratePendingNode).toHaveBeenCalledTimes(2)
      expect(mockHydratePendingNode).toHaveBeenCalledWith('pending-node-1', {
        text_content: 'Mechanism content',
        summary_title: 'Mechanism summary',
        citations: [],
      })
      expect(mockHydratePendingNode).toHaveBeenCalledWith('pending-node-2', {
        text_content: 'Validation content',
        summary_title: 'Validation summary',
        citations: [],
      })
    })

    it('out-of-order completion safety: late first completion hydrates correct pending node', async () => {
      useStore.setState({ ghostNodes: [MOCK_GHOST, MOCK_GHOST_2] })

      mockCreatePendingNodeFromGhost.mockImplementation((ghostId: string) => {
        if (ghostId === 'ghost-1') return 'pending-node-1'
        if (ghostId === 'ghost-2') return 'pending-node-2'
        return null
      })

      const first = createDeferred<GeneratedStep>()
      const second = createDeferred<GeneratedStep>()

      vi.spyOn(aiService, 'generateStepFromDirection')
        .mockImplementationOnce(() => first.promise)
        .mockImplementationOnce(() => second.promise)

      const { result } = renderHook(() => useGenerate())

      await act(async () => {
        const firstAccept = result.current.acceptGhost('ghost-1')
        const secondAccept = result.current.acceptGhost('ghost-2')

        second.resolve({
          type: 'VALIDATION',
          text_content: 'Second completed first',
          summary_title: 'Second done',
          citations: [],
        })
        await Promise.resolve()

        first.resolve({
          type: 'MECHANISM',
          text_content: 'First completed later',
          summary_title: 'First done',
          citations: [],
        })

        await Promise.all([firstAccept, secondAccept])
      })

      expect(mockHydratePendingNode).toHaveBeenCalledTimes(2)
      expect(mockHydratePendingNode.mock.calls[0]).toEqual([
        'pending-node-2',
        {
          text_content: 'Second completed first',
          summary_title: 'Second done',
          citations: [],
        },
      ])
      expect(mockHydratePendingNode.mock.calls[1]).toEqual([
        'pending-node-1',
        {
          text_content: 'First completed later',
          summary_title: 'First done',
          citations: [],
        },
      ])
    })

    it('failure: creates pending node, marks retryable error for rate limit', async () => {
      mockCreatePendingNodeFromGhost.mockReturnValue('pending-node-1')
      vi.spyOn(aiService, 'generateStepFromDirection').mockRejectedValue(new Error('Rate limit exceeded'))

      const { result } = renderHook(() => useGenerate())

      await act(async () => {
        await result.current.acceptGhost('ghost-1')
      })

      expect(mockCreatePendingNodeFromGhost).toHaveBeenCalledWith('ghost-1')
      expect(mockMarkPendingNodeError).toHaveBeenCalledWith('pending-node-1', {
        message: 'Rate limit exceeded',
        retryable: true,
        code: 'rate_limit',
      })
      expect(mockHydratePendingNode).not.toHaveBeenCalled()
    })

    it('duplicate accept prevention: no generation if createPendingNodeFromGhost returns null', async () => {
      mockCreatePendingNodeFromGhost.mockReturnValue(null)

      const { result } = renderHook(() => useGenerate())

      await act(async () => {
        await result.current.acceptGhost('ghost-1')
      })

      expect(mockCreatePendingNodeFromGhost).toHaveBeenCalledWith('ghost-1')
      expect(aiService.generateStepFromDirection).not.toHaveBeenCalled()
      expect(mockHydratePendingNode).not.toHaveBeenCalled()
      expect(mockMarkPendingNodeError).not.toHaveBeenCalled()
    })

    it('duplicate accept prevention: concurrent double-accept on same ghost triggers one generation', async () => {
      mockCreatePendingNodeFromGhost
        .mockImplementationOnce(() => 'pending-node-1')
        .mockImplementationOnce(() => null)

      vi.spyOn(aiService, 'generateStepFromDirection').mockResolvedValue({
        type: 'MECHANISM',
        text_content: 'Only one generation',
        summary_title: 'Single hydrate',
        citations: [],
      })

      const { result } = renderHook(() => useGenerate())

      await act(async () => {
        await Promise.all([
          result.current.acceptGhost('ghost-1'),
          result.current.acceptGhost('ghost-1'),
        ])
      })

      expect(mockCreatePendingNodeFromGhost).toHaveBeenCalledTimes(2)
      expect(aiService.generateStepFromDirection).toHaveBeenCalledTimes(1)
      expect(mockHydratePendingNode).toHaveBeenCalledTimes(1)
      expect(mockHydratePendingNode).toHaveBeenCalledWith('pending-node-1', {
        text_content: 'Only one generation',
        summary_title: 'Single hydrate',
        citations: [],
      })
    })

    it('sibling ghosts unaffected: only accepted ghost is processed', async () => {
      const siblingGhost = {
        ...MOCK_GHOST,
        id: 'ghost-2',
        data: { ...MOCK_GHOST.data, ghostId: 'ghost-2', summary_title: 'Sibling' },
      }
      useStore.setState({ ghostNodes: [MOCK_GHOST, siblingGhost] })

      mockCreatePendingNodeFromGhost.mockReturnValue('pending-node-1')
      vi.spyOn(aiService, 'generateStepFromDirection').mockResolvedValue({
        type: 'MECHANISM',
        text_content: 'Full content',
        summary_title: 'Mechanism summary',
        citations: [],
      })

      const { result } = renderHook(() => useGenerate())

      await act(async () => {
        await result.current.acceptGhost('ghost-1')
      })

      expect(mockCreatePendingNodeFromGhost).toHaveBeenCalledTimes(1)
      expect(mockCreatePendingNodeFromGhost).toHaveBeenCalledWith('ghost-1')
      const { ghostNodes } = useStore.getState()
      expect(ghostNodes.some((g) => g.id === 'ghost-2')).toBe(true)
    })

    it('non-retryable error for auth failures', async () => {
      mockCreatePendingNodeFromGhost.mockReturnValue('pending-node-1')
      vi.spyOn(aiService, 'generateStepFromDirection').mockRejectedValue(new Error('Invalid API key'))

      const { result } = renderHook(() => useGenerate())

      await act(async () => {
        await result.current.acceptGhost('ghost-1')
      })

      expect(mockMarkPendingNodeError).toHaveBeenCalledWith('pending-node-1', {
        message: 'Invalid API key',
        retryable: false,
        code: 'auth',
      })
    })

    it('retryable error recovery sequence reuses same node id', async () => {
      mockCreatePendingNodeFromGhost.mockReturnValue('pending-node-1')
      mockRetryPendingNodeGeneration.mockReturnValue(true)

      vi.spyOn(aiService, 'generateStepFromDirection')
        .mockRejectedValueOnce(new Error('Rate limit exceeded'))
        .mockResolvedValueOnce({
          type: 'MECHANISM',
          text_content: 'Recovered content',
          summary_title: 'Recovered title',
          citations: [],
        })

      const { result } = renderHook(() => useGenerate())

      await act(async () => {
        await result.current.acceptGhost('ghost-1')
      })

      await act(async () => {
        await result.current.retryPendingNodeGeneration('pending-node-1')
      })

      expect(mockCreatePendingNodeFromGhost).toHaveBeenCalledTimes(1)
      expect(mockRetryPendingNodeGeneration).toHaveBeenCalledWith('pending-node-1')
      expect(aiService.generateStepFromDirection).toHaveBeenCalledTimes(2)
      expect(mockHydratePendingNode).toHaveBeenCalledWith('pending-node-1', {
        text_content: 'Recovered content',
        summary_title: 'Recovered title',
        citations: [],
      })
    })

    it('terminal parse errors are classified as non-retryable', async () => {
      mockCreatePendingNodeFromGhost.mockReturnValue('pending-node-1')
      vi.spyOn(aiService, 'generateStepFromDirection').mockRejectedValue(
        new Error('Failed to parse AI response')
      )

      const { result } = renderHook(() => useGenerate())

      await act(async () => {
        await result.current.acceptGhost('ghost-1')
      })

      expect(mockMarkPendingNodeError).toHaveBeenCalledWith('pending-node-1', {
        message: 'Failed to parse AI response',
        retryable: false,
        code: 'parse',
      })
    })

    it('retry path never creates a new node', async () => {
      mockCreatePendingNodeFromGhost.mockReturnValue('pending-node-1')
      mockRetryPendingNodeGeneration.mockReturnValue(true)

      vi.spyOn(aiService, 'generateStepFromDirection')
        .mockRejectedValueOnce(new Error('Rate limit exceeded'))
        .mockResolvedValueOnce({
          type: 'MECHANISM',
          text_content: 'Recovered content',
          summary_title: 'Recovered title',
          citations: [],
        })

      const { result } = renderHook(() => useGenerate())

      await act(async () => {
        await result.current.acceptGhost('ghost-1')
        await result.current.retryPendingNodeGeneration('pending-node-1')
      })

      expect(mockCreatePendingNodeFromGhost).toHaveBeenCalledTimes(1)
      expect(mockRetryPendingNodeGeneration).toHaveBeenCalledTimes(1)
    })
  })
})
