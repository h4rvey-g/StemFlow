import React from 'react'
import { render, screen } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import Page from '../app/page'
import type { StoreState } from '@/stores/useStore'


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
    isLoading: false,
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
})
