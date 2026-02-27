import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { InspectorAiActions } from '@/components/ui/InspectorAiActions'

const mockExecuteAction = vi.fn()
const mockTranslateNodeContent = vi.fn()
const mockCancel = vi.fn()
const mockAddNode = vi.fn()
const mockAddEdge = vi.fn()

let mockAiState = {
  isLoading: false,
  streamingText: '',
  error: null as { message: string; provider: string } | null,
  currentAction: null as string | null,
}

let mockStoreState: any = {
  nodes: [
    { id: 'node-1', type: 'OBSERVATION', position: { x: 0, y: 0 }, data: { text_content: 'test' } }
  ],
  edges: [],
  addNode: mockAddNode,
  addEdge: mockAddEdge,
}

vi.mock('@/hooks/useAi', () => ({
  useAi: () => ({
    isLoading: mockAiState.isLoading,
    streamingText: mockAiState.streamingText,
    error: mockAiState.error,
    currentAction: mockAiState.currentAction,
    executeAction: mockExecuteAction,
    translateNodeContent: mockTranslateNodeContent,
    cancel: mockCancel,
  }),
}))

vi.mock('@/stores/useStore', () => ({
  useStore: Object.assign(
    (sel?: any) => {
      if (sel) return sel(mockStoreState)
      return mockStoreState
    },
    {
      getState: () => mockStoreState
    }
  ),
}))

describe('InspectorAiActions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAiState = {
      isLoading: false,
      streamingText: '',
      error: null,
      currentAction: null,
    }
    mockStoreState.nodes = [
      { id: 'node-1', type: 'OBSERVATION', position: { x: 0, y: 0 }, data: { text_content: 'test' } }
    ]
    mockTranslateNodeContent.mockReset()
  })

  it('renders action buttons including suggest', () => {
    render(<InspectorAiActions nodeId="node-1" />)
    
    expect(screen.getByText('Translation')).toBeInTheDocument()
    expect(screen.getByText('Chat')).toBeInTheDocument()
    expect(screen.queryByText('Summarize')).not.toBeInTheDocument()
    expect(screen.queryByText('Suggest Mechanism')).not.toBeInTheDocument()
    expect(screen.queryByText('Suggest Validation')).not.toBeInTheDocument()
    expect(screen.queryByText('Critique')).not.toBeInTheDocument()
    expect(screen.queryByText('Expand')).not.toBeInTheDocument()
    expect(screen.queryByText('Generate Questions')).not.toBeInTheDocument()
  })

  it('translation opens language picker and triggers translation call', async () => {
    render(<InspectorAiActions nodeId="node-1" />)

    fireEvent.click(screen.getByText('Translation'))
    expect(screen.getByLabelText('Target language')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Translate'))
    await waitFor(() => {
      expect(mockTranslateNodeContent).toHaveBeenCalledWith('zh-CN')
    })
  })

  it('shows streaming text when loading', () => {
    mockAiState.streamingText = 'Streaming...'
    mockAiState.isLoading = true
    
    render(<InspectorAiActions nodeId="node-1" />)
    
    expect(screen.getByTestId('streaming-text-container')).toBeInTheDocument()
  })

  it('shows error message', () => {
    mockAiState.error = { message: 'API error', provider: 'openai' }
    
    render(<InspectorAiActions nodeId="node-1" />)
    
    expect(screen.getByText('API error')).toBeInTheDocument()
  })

  it('shows apply button when text exists', () => {
    mockAiState.streamingText = 'Result'
    
    render(<InspectorAiActions nodeId="node-1" />)
    
    expect(screen.getByText('Apply')).toBeInTheDocument()
  })

  it('apply creates new node with same type for non-suggest', () => {
    mockAiState.streamingText = 'Summary'
    
    render(<InspectorAiActions nodeId="node-1" />)
    
    fireEvent.click(screen.getByText('Apply'))
    
    expect(mockAddNode).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'OBSERVATION',
        data: { text_content: 'Summary' },
      })
    )
  })

  describe('AI failure handling', () => {
    it('displays error message when AI request fails', () => {
      mockAiState.error = { message: 'Network timeout', provider: 'anthropic' }
      
      render(<InspectorAiActions nodeId="node-1" />)
      
      expect(screen.getByText('Network timeout')).toBeInTheDocument()
    })

    it('displays error with provider context', () => {
      mockAiState.error = { message: 'Invalid API key', provider: 'openai' }
      
      render(<InspectorAiActions nodeId="node-1" />)
      
      expect(screen.getByText('Invalid API key')).toBeInTheDocument()
    })

    it('does not show apply button when error exists', () => {
      mockAiState.error = { message: 'Rate limit exceeded', provider: 'gemini' }
      mockAiState.streamingText = ''
      
      render(<InspectorAiActions nodeId="node-1" />)
      
      expect(screen.queryByText('Apply')).not.toBeInTheDocument()
    })

    it('clears previous error when new action starts', () => {
      mockAiState.error = { message: 'Previous error', provider: 'openai' }
      
      const { rerender } = render(<InspectorAiActions nodeId="node-1" />)
      
      expect(screen.getByText('Previous error')).toBeInTheDocument()
      
      mockAiState.error = null
      mockAiState.isLoading = true
      
      rerender(<InspectorAiActions nodeId="node-1" />)
      
      expect(screen.queryByText('Previous error')).not.toBeInTheDocument()
  })

  it('chat action dispatches stemflow:open-chat event', () => {
    const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent')
    
    render(<InspectorAiActions nodeId="node-1" />)
    
    fireEvent.click(screen.getByText('Chat'))
    
    expect(dispatchEventSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'stemflow:open-chat',
        detail: { nodeId: 'node-1' },
      })
    )
    
    dispatchEventSpy.mockRestore()
  })
  })
})
