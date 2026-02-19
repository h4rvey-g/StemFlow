import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { ResearchNodeCard } from '@/components/nodes/ResearchNodeCard'
import { NodeData } from '@/types/nodes'
import { useGenerate } from '@/hooks/useGenerate'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { ReactFlowProvider } from 'reactflow'

vi.mock('@/hooks/useGenerate', () => ({
  useGenerate: vi.fn(),
}))

vi.mock('@/hooks/useAi', () => ({
  useAi: () => ({
    generate: vi.fn(),
    isLoading: false,
  }),
}))

vi.mock('@/stores/useStore', () => ({
  useStore: vi.fn((selector) => selector({
    updateNodeData: vi.fn(),
    addNode: vi.fn(),
    addEdge: vi.fn(),
    globalGoal: '',
    // Add nodes array for getCurrentAttachments
    nodes: [],
  })),
}))

vi.mock('@/stores/useProjectStore', () => ({
  useProjectStore: vi.fn((selector) => selector({
    activeProjectId: 'test-project',
  })),
}))

describe('ResearchNodeCard', () => {
  const mockRetry = vi.fn()
  
  beforeEach(() => {
    (useGenerate as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      retryPendingNodeGeneration: mockRetry,
      generate: vi.fn(),
      isGenerating: false,
    })
    mockRetry.mockClear()
  })

  const defaultProps = {
    id: 'test-node',
    selected: false,
    type: 'OBSERVATION' as const,
    data: {
      label: 'Test Node',
      content: 'Test content',
    } as unknown as NodeData,
    title: 'Observation',
    placeholder: 'Enter observation...',
    accentClassName: 'bg-blue-500',
    nodeType: 'OBSERVATION' as const,
    isConnectable: true,
    xPos: 0,
    yPos: 0,
    zIndex: 0,
    dragging: false,
  }

  const renderWithProvider = (component: React.ReactNode) => {
    return render(
      <ReactFlowProvider>
        {component}
      </ReactFlowProvider>
    )
  }

  it('renders basic node content', () => {
    renderWithProvider(<ResearchNodeCard {...defaultProps} />)
    // Check for placeholder since content is empty string in defaultProps
    expect(screen.getAllByText('Enter observation...')[0]).toBeInTheDocument()
  })

  it('shows pending spinner when generationStatus is pending', () => {
    const props = {
      ...defaultProps,
      data: {
        ...defaultProps.data,
        generationStatus: 'pending' as const,
      },
    }
    renderWithProvider(<ResearchNodeCard {...props} />)
    expect(screen.getByTestId('node-generation-spinner')).toBeInTheDocument()
  })

  it('shows error message and retry button when generationStatus is error', () => {
    const props = {
      ...defaultProps,
      data: {
        ...defaultProps.data,
        generationStatus: 'error' as const,
        generationError: {
          message: 'AI generation failed',
          retryable: true,
        },
      },
    }
    renderWithProvider(<ResearchNodeCard {...props} />)
    expect(screen.getByText('AI generation failed')).toBeInTheDocument()
    expect(screen.getByTestId('node-generation-retry')).toBeInTheDocument()
    
    const retryButton = screen.getByTestId('node-generation-retry')
    fireEvent.click(retryButton)
    
    expect(mockRetry).toHaveBeenCalledWith('test-node')
  })

  it('does not show retry button if error is not retryable', () => {
    const props = {
      ...defaultProps,
      data: {
        ...defaultProps.data,
        generationStatus: 'error' as const,
        generationError: {
          message: 'Fatal error',
          retryable: false,
        },
      },
    }
    renderWithProvider(<ResearchNodeCard {...props} />)
    
    expect(screen.getByText('Fatal error')).toBeInTheDocument()
    expect(screen.queryByTestId('node-generation-retry')).not.toBeInTheDocument()
  })
})
