import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useGenerate } from '@/hooks/useGenerate'
import { useStore } from '@/stores/useStore'
import * as apiKeys from '@/lib/api-keys'
import * as aiService from '@/lib/ai-service'
import * as graph from '@/lib/graph'

vi.mock('@/lib/api-keys')
vi.mock('@/lib/ai-service')
vi.mock('@/lib/graph')

describe('useGenerate', () => {
  const mockSetGhostNodes = vi.fn()
  const mockSetGhostSuggestions = vi.fn()
  const mockSetIsGenerating = vi.fn()
  const mockSetAiError = vi.fn()

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
      globalGoal: 'Test goal',
      setGhostNodes: mockSetGhostNodes,
      setGhostSuggestions: mockSetGhostSuggestions,
      setIsGenerating: mockSetIsGenerating,
      setAiError: mockSetAiError,
      isGenerating: false,
    })
  })

  it('should generate ghost nodes successfully', async () => {
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

    vi.spyOn(graph, 'getNodeAncestry').mockReturnValue([
      {
        id: 'node-1',
        type: 'OBSERVATION',
        data: { text_content: 'Test observation' },
        position: { x: 100, y: 100 },
      },
    ])
    vi.spyOn(graph, 'buildNodeSuggestionContext').mockReturnValue([])

    vi.spyOn(aiService, 'generateNextSteps').mockResolvedValue([
      { type: 'MECHANISM', summary_title: 'Mechanism summary', text_content: 'Suggested mechanism' },
      { type: 'VALIDATION', summary_title: 'Validation summary', text_content: 'Suggested validation' },
      { type: 'OBSERVATION', summary_title: 'Observation summary', text_content: 'Suggested observation' },
    ])

    const { result } = renderHook(() => useGenerate())

    await act(async () => {
      await result.current.generate('node-1')
    })

    expect(mockSetIsGenerating).toHaveBeenCalledWith(true)
    expect(mockSetAiError).toHaveBeenCalledWith(null)
    expect(apiKeys.loadApiKeys).toHaveBeenCalled()
    expect(graph.getNodeAncestry).toHaveBeenCalled()
    expect(aiService.generateNextSteps).toHaveBeenCalledWith(
      expect.any(Array),
      'Test goal',
      'openai',
      'sk-test',
      null,
      null,
      []
    )
    expect(mockSetGhostSuggestions).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'GHOST',
          position: { x: 480, y: 100 },
            data: expect.objectContaining({
              parentId: 'node-1',
              suggestedType: 'MECHANISM',
              summary_title: 'Mechanism summary',
              text_content: 'Suggested mechanism',
            }),
          }),
      ]),
      expect.any(Array)
    )

    expect(mockSetGhostSuggestions).toHaveBeenCalledWith(
      expect.arrayContaining([expect.any(Object), expect.any(Object), expect.any(Object)]),
      expect.any(Array)
    )
    expect(mockSetIsGenerating).toHaveBeenCalledWith(false)
  })

  it('should handle missing API keys', async () => {
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
    })

    const { result } = renderHook(() => useGenerate())

    await act(async () => {
      await result.current.generate('node-1')
    })

    expect(mockSetAiError).toHaveBeenCalledWith(null)
    expect(mockSetAiError).toHaveBeenLastCalledWith('No API key found. Please configure settings.')
    expect(mockSetIsGenerating).toHaveBeenCalledWith(false)
  })

  it('should handle AI service errors', async () => {
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

    vi.spyOn(aiService, 'generateNextSteps').mockRejectedValue(new Error('AI Error'))
    vi.spyOn(graph, 'buildNodeSuggestionContext').mockReturnValue([])

    const { result } = renderHook(() => useGenerate())

    await act(async () => {
      await result.current.generate('node-1')
    })

    expect(mockSetAiError).toHaveBeenCalledWith('AI Error')
    expect(mockSetIsGenerating).toHaveBeenCalledWith(false)
  })
})
