import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { GhostNode } from '../components/nodes/GhostNode'
import type { GhostNodeData } from '@/types/nodes'
import { ReactFlowProvider } from 'reactflow'

const mockAcceptGhost = vi.fn()
const mockDismissGhostNode = vi.fn()

vi.mock('@/stores/useStore', () => ({
  useStore: (selector: any) =>
    selector({
      dismissGhostNode: mockDismissGhostNode,
    }),
}))

vi.mock('@/hooks/useGenerate', () => ({
  useGenerate: () => ({
    acceptGhost: mockAcceptGhost,
  }),
}))

const renderWithProvider = (component: React.ReactNode) => {
  return render(<ReactFlowProvider>{component}</ReactFlowProvider>)
}

const escapeForRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const fallbackPattern = (text: string, key: string) =>
  new RegExp(`^(?:${escapeForRegex(text)}|${escapeForRegex(key)})$`, 'i')

describe('GhostNode', () => {
  const defaultProps = {
    id: 'ghost-1',
    data: {
      text_content: 'This text should not be rendered',
      summary_title: 'This is a suggested observation title',
      suggestedType: 'OBSERVATION',
      parentId: 'parent-1',
      ghostId: 'ghost-1',
      citations: [{ index: 1, title: 'Ref 1', url: 'http://example.com' }]
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

  it('renders correctly with observation styling and title only', () => {
    renderWithProvider(<GhostNode {...defaultProps} />)
    
    expect(
      screen.getByText(fallbackPattern('Suggested Observation', 'nodes.ghost.suggestedObservation'))
    ).toBeInTheDocument()
    expect(screen.getByText('This is a suggested observation title')).toBeInTheDocument()
    expect(screen.queryByText('This text should not be rendered')).not.toBeInTheDocument()
    expect(screen.queryByText('Ref 1')).not.toBeInTheDocument()
    
    const container = screen.getByTestId('ghost-node-card')
    expect(container).toHaveClass('border-dashed')
  })

  it('renders correctly with mechanism styling', () => {
    const props = {
      ...defaultProps,
      data: {
        ...defaultProps.data,
        suggestedType: 'MECHANISM' as const,
        summary_title: 'Mechanism Title',
      },
    }
    renderWithProvider(<GhostNode {...props} />)
    
    expect(
      screen.getByText(fallbackPattern('Suggested Mechanism', 'nodes.ghost.suggestedMechanism'))
    ).toBeInTheDocument()
    expect(screen.getByText('Mechanism Title')).toBeInTheDocument()
    
    const container = screen.getByTestId('ghost-node-card')
    expect(container).toHaveClass('border-dashed')
  })

  it('calls acceptGhost from useGenerate when accept button is clicked', () => {
    renderWithProvider(<GhostNode {...defaultProps} />)
    
    const acceptButton = screen.getByLabelText(fallbackPattern('Accept suggestion', 'nodes.ghost.acceptSuggestion'))
    fireEvent.click(acceptButton)
    
    expect(mockAcceptGhost).toHaveBeenCalledWith('ghost-1')
  })

  it('calls dismissGhostNode when dismiss button is clicked', () => {
    renderWithProvider(<GhostNode {...defaultProps} />)
    
    const dismissButton = screen.getByLabelText(fallbackPattern('Dismiss suggestion', 'nodes.ghost.dismissSuggestion'))
    fireEvent.click(dismissButton)
    
    expect(mockDismissGhostNode).toHaveBeenCalledWith('ghost-1')
  })
})
