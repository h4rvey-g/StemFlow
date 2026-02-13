import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import Page from '../app/page'
import type { StoreState } from '@/stores/useStore'
import { useStore } from '@/stores/useStore'


class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = ResizeObserver

vi.mock('@/stores/useStore', () => {
  const state: StoreState = {
    nodes: [],
    edges: [],
    manualGroups: [],
    ghostNodes: [],
    ghostEdges: [],
    isGenerating: false,
    aiError: null,
    globalGoal: '',
    isLoading: false,
    undoStack: [],
    loadFromDb: vi.fn(),
    addNode: vi.fn(),
    updateNode: vi.fn(),
    updateNodeData: vi.fn(),
    deleteNode: vi.fn(),
    addEdge: vi.fn(),
    deleteEdge: vi.fn(),
    onNodesChange: vi.fn(),
    onEdgesChange: vi.fn(),
    onConnect: vi.fn(),
    setGhostNodes: vi.fn(),
    setGhostSuggestions: vi.fn(),
    acceptGhostNode: vi.fn(),
    acceptAllGhostNodes: vi.fn(),
    dismissGhostNode: vi.fn(),
    dismissAllGhostNodes: vi.fn(),
    setIsGenerating: vi.fn(),
    setAiError: vi.fn(),
    setGlobalGoal: vi.fn(),
    setNodeGrade: vi.fn(),
    createManualGroup: vi.fn(),
    deleteManualGroup: vi.fn(),
    renameManualGroup: vi.fn(),
    clearGhostNodes: vi.fn(),
    formatCanvas: vi.fn(),
    undoLastAction: vi.fn(),
    experimentalConditions: [],
    setExperimentalConditions: vi.fn(),
  }

  const useStore = <T,>(selector?: (state: StoreState) => T) =>
    selector ? selector(state) : state

  return {
    useStore,
    NodeType: {
      OBSERVATION: 'OBSERVATION',
      MECHANISM: 'MECHANISM',
      VALIDATION: 'VALIDATION',
    },
  }
})

describe('Canvas Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the sidebar and canvas', () => {
    render(<Page />)
    expect(screen.getByRole('complementary')).toBeInTheDocument() // Sidebar
    expect(screen.getByText('Nodes')).toBeInTheDocument()
  })


  it('sidebar items are draggable', () => {
    render(<Page />)
    
    const observationItem = screen.getByText('Observation')
    expect(observationItem.getAttribute('draggable')).toBe('true')
  })

  it('calls undo action on ctrl/cmd+z', () => {
    render(<Page />)

    const undoLastAction = useStore((state) => state.undoLastAction)

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
    fireEvent.keyDown(window, { key: 'z', metaKey: true })

    expect(undoLastAction).toHaveBeenCalledTimes(2)
  })

  it('shows grouped ghost actions and triggers accept all/dismiss all', () => {
    const state = useStore() as StoreState
    state.ghostNodes = [
      {
        id: 'ghost-1',
        type: 'GHOST',
        position: { x: 0, y: 0 },
        data: {
          text_content: 'Suggested',
          suggestedType: 'OBSERVATION',
          parentId: 'parent-1',
          ghostId: 'ghost-1',
        },
      },
      {
        id: 'ghost-2',
        type: 'GHOST',
        position: { x: 0, y: 80 },
        data: {
          text_content: 'Suggested 2',
          suggestedType: 'MECHANISM',
          parentId: 'parent-1',
          ghostId: 'ghost-2',
        },
      },
    ]

    render(<Page />)

    const actionBar = screen.getByTestId('ghost-suggestion-actions')
    expect(actionBar).toBeInTheDocument()

    const acceptAllButton = screen.getByTestId('ghost-group-accept-all')
    const dismissAllButton = screen.getByTestId('ghost-group-dismiss-all')

    expect(acceptAllButton).toHaveTextContent('Accept All (2)')
    expect(dismissAllButton).toHaveTextContent('Dismiss All')

    fireEvent.click(acceptAllButton)
    fireEvent.click(dismissAllButton)

    expect(state.acceptAllGhostNodes).toHaveBeenCalledTimes(1)
    expect(state.dismissAllGhostNodes).toHaveBeenCalledTimes(1)
  })
})
