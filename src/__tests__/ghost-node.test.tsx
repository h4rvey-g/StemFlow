import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { GhostNode } from '../components/nodes/GhostNode'
import type { GhostNodeData } from '@/types/nodes'
import { ReactFlowProvider } from 'reactflow'

const mockAcceptGhostNode = vi.fn()
const mockDismissGhostNode = vi.fn()

vi.mock('@/stores/useStore', () => ({
  useStore: (selector: any) =>
    selector({
      acceptGhostNode: mockAcceptGhostNode,
      dismissGhostNode: mockDismissGhostNode,
    }),
}))

const renderWithProvider = (component: React.ReactNode) => {
  return render(<ReactFlowProvider>{component}</ReactFlowProvider>)
}

describe('GhostNode', () => {
  const defaultProps = {
    id: 'ghost-1',
    data: {
      text_content: 'This is a suggested observation',
      suggestedType: 'OBSERVATION',
      parentId: 'parent-1',
      ghostId: 'ghost-1',
    } as GhostNodeData,
    selected: false,
    zIndex: 1000,
    isConnectable: true,
    xPos: 0,
    yPos: 0,
    dragging: false,
    type: 'ghost',
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders correctly with observation styling', () => {
    renderWithProvider(<GhostNode {...defaultProps} />)
    
    expect(screen.getByText('SUGGESTED OBSERVATION')).toBeInTheDocument()
    expect(screen.getByText('This is a suggested observation')).toBeInTheDocument()
    
    const container = screen.getByText('SUGGESTED OBSERVATION').closest('div')?.parentElement
    expect(container).toHaveClass('border-dashed')
  })

  it('renders correctly with mechanism styling', () => {
    const props = {
      ...defaultProps,
      data: {
        ...defaultProps.data,
        suggestedType: 'MECHANISM' as const,
      },
    }
    renderWithProvider(<GhostNode {...props} />)
    
    expect(screen.getByText('SUGGESTED MECHANISM')).toBeInTheDocument()
    const container = screen.getByText('SUGGESTED MECHANISM').closest('div')?.parentElement
    expect(container).toHaveClass('border-dashed')
  })

  it('calls acceptGhostNode when accept button is clicked', () => {
    renderWithProvider(<GhostNode {...defaultProps} />)
    
    const acceptButton = screen.getByLabelText('Accept suggestion')
    fireEvent.click(acceptButton)
    
    expect(mockAcceptGhostNode).toHaveBeenCalledWith('ghost-1')
  })

  it('calls dismissGhostNode when dismiss button is clicked', () => {
    renderWithProvider(<GhostNode {...defaultProps} />)
    
    const dismissButton = screen.getByLabelText('Dismiss suggestion')
    fireEvent.click(dismissButton)
    
    expect(mockDismissGhostNode).toHaveBeenCalledWith('ghost-1')
  })
})
