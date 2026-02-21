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
vi.mock('@/lib/db', () => ({
  db: {
    nodes: { where: () => ({ equals: () => ({ toArray: async () => [] }) }) },
    edges: { where: () => ({ equals: () => ({ toArray: async () => [] }) }) },
    transaction: (_mode: string, _t1: unknown, _t2: unknown, fn: () => Promise<void>) => fn(),
  },
}))


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

const PARENT_NODE = {
  id: 'node-1',
  type: 'OBSERVATION' as const,
  data: { text_content: 'Test observation' },
  position: { x: 100, y: 100 },
}

const PLANNER_DIRECTIONS = [
  {
    id: 'dir-1',
    summary_title: 'Mechanism A',
    suggestedType: 'MECHANISM' as const,
    searchQuery: 'query-1',
    sourceNodeId: 'node-1',
  },
  {
    id: 'dir-2',
    summary_title: 'Mechanism B',
    suggestedType: 'MECHANISM' as const,
    searchQuery: 'query-2',
    sourceNodeId: 'node-1',
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  useStore.setState({
    nodes: [PARENT_NODE],
    edges: [],
    ghostNodes: [],
    ghostEdges: [],
    globalGoal: 'Test goal',
    isGenerating: false,
    aiError: null,
  })
  vi.spyOn(apiKeys, 'loadApiKeys').mockResolvedValue(MOCK_API_KEYS)
  vi.spyOn(graph, 'getNodeAncestry').mockReturnValue([PARENT_NODE])
  vi.spyOn(graph, 'buildNodeSuggestionContext').mockReturnValue([])
})

describe('planner-preview → accept integration', () => {
  it('generate produces ghost nodes without calling generateStepFromDirection', async () => {
    vi.spyOn(aiService, 'planNextDirections').mockResolvedValue(PLANNER_DIRECTIONS)

    const { result } = renderHook(() => useGenerate())

    await act(async () => {
      await result.current.generate('node-1')
    })

    expect(aiService.planNextDirections).toHaveBeenCalledTimes(1)
    expect(aiService.generateStepFromDirection).not.toHaveBeenCalled()

    const { ghostNodes } = useStore.getState()
    expect(ghostNodes).toHaveLength(2)
    expect(ghostNodes[0].data.text_content).toBeUndefined()
    expect(ghostNodes[0].data.plannerDirection.summary_title).toBe('Mechanism A')
    expect(ghostNodes[1].data.plannerDirection.summary_title).toBe('Mechanism B')
  })

  it('accept success: pending node created then hydrated to complete', async () => {
    vi.spyOn(aiService, 'planNextDirections').mockResolvedValue(PLANNER_DIRECTIONS)
    vi.spyOn(aiService, 'generateStepFromDirection').mockResolvedValue({
      type: 'MECHANISM',
      text_content: 'Full mechanism content',
      summary_title: 'Mechanism A',
      citations: [],
    })

    const { result } = renderHook(() => useGenerate())

    await act(async () => {
      await result.current.generate('node-1')
    })

    const ghostId = useStore.getState().ghostNodes[0].id

    await act(async () => {
      await result.current.acceptGhost(ghostId)
    })

    const { nodes } = useStore.getState()
    const realNode = nodes.find((n) => n.data.generationStatus === 'complete')
    expect(realNode).toBeDefined()
    expect(realNode?.data.text_content).toBe('Full mechanism content')
    expect(realNode?.data.summary_title).toBe('Mechanism A')
    expect(aiService.generateStepFromDirection).toHaveBeenCalledTimes(1)
  })

  it('accept failure: pending node transitions to error state', async () => {
    vi.spyOn(aiService, 'planNextDirections').mockResolvedValue(PLANNER_DIRECTIONS)
    vi.spyOn(aiService, 'generateStepFromDirection').mockRejectedValue(
      new Error('Rate limit exceeded')
    )

    const { result } = renderHook(() => useGenerate())

    await act(async () => {
      await result.current.generate('node-1')
    })

    const ghostId = useStore.getState().ghostNodes[0].id

    await act(async () => {
      await result.current.acceptGhost(ghostId)
    })

    const { nodes } = useStore.getState()
    const errorNode = nodes.find((n) => n.data.generationStatus === 'error')
    expect(errorNode).toBeDefined()
    expect(errorNode?.data.generationError?.message).toBe('Rate limit exceeded')
    expect(errorNode?.data.generationError?.retryable).toBe(true)
    expect(errorNode?.data.generationError?.code).toBe('rate_limit')
  })

  it('sibling ghosts remain after one accept', async () => {
    vi.spyOn(aiService, 'planNextDirections').mockResolvedValue(PLANNER_DIRECTIONS)
    vi.spyOn(aiService, 'generateStepFromDirection').mockResolvedValue({
      type: 'MECHANISM',
      text_content: 'Full content',
      summary_title: 'Mechanism A',
      citations: [],
    })

    const { result } = renderHook(() => useGenerate())

    await act(async () => {
      await result.current.generate('node-1')
    })

    const ghostsBefore = useStore.getState().ghostNodes
    expect(ghostsBefore).toHaveLength(2)
    const [firstGhostId, secondGhostId] = ghostsBefore.map((g) => g.id)

    await act(async () => {
      await result.current.acceptGhost(firstGhostId)
    })

    const { ghostNodes } = useStore.getState()
    expect(ghostNodes.some((g) => g.id === secondGhostId)).toBe(true)
    expect(ghostNodes.some((g) => g.id === firstGhostId)).toBe(false)
  })
})
