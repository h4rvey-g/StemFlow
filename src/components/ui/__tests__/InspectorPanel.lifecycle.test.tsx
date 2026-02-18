import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { InspectorPanel } from '../InspectorPanel'
import { InspectorAiActions } from '../InspectorAiActions'

let mockStoreState: any = {
  nodes: [
    { id: 'node-1', type: 'OBSERVATION', position: { x: 0, y: 0 }, data: { text_content: 'test' } }
  ],
  edges: [],
  addNode: vi.fn(),
  addEdge: vi.fn(),
}

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

let mockAiState = {
  isLoading: false,
  streamingText: '',
  error: null as { message: string; provider: string } | null,
  currentAction: null as string | null,
}

vi.mock('@/hooks/useAi', () => ({
  useAi: () => ({
    isLoading: mockAiState.isLoading,
    streamingText: mockAiState.streamingText,
    error: mockAiState.error,
    currentAction: mockAiState.currentAction,
    executeAction: vi.fn(),
    cancel: vi.fn(),
  }),
}))

describe('InspectorPanel Lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
    mockStoreState.nodes = [
      { id: 'node-1', type: 'OBSERVATION', position: { x: 0, y: 0 }, data: { text_content: 'test' } }
    ]
    mockAiState = {
      isLoading: false,
      streamingText: '',
      error: null,
      currentAction: null,
    }
  })

  describe('Active node deletion while inspector open', () => {
    it('does not crash when active node is deleted', () => {
      const onClose = vi.fn()
      const { rerender } = render(
        <InspectorPanel isOpen={true} onClose={onClose}>
          <InspectorAiActions nodeId="node-1" />
        </InspectorPanel>
      )

      expect(screen.getByTestId('inspector-panel')).toBeInTheDocument()

      mockStoreState.nodes = []

      rerender(
        <InspectorPanel isOpen={true} onClose={onClose}>
          <InspectorAiActions nodeId="node-1" />
        </InspectorPanel>
      )

      expect(screen.getByTestId('inspector-panel')).toBeInTheDocument()
    })

    it('handles missing node gracefully in AI actions', () => {
      mockStoreState.nodes = []

      render(
        <InspectorPanel isOpen={true} onClose={vi.fn()}>
          <InspectorAiActions nodeId="nonexistent" />
        </InspectorPanel>
      )

      expect(screen.getByTestId('inspector-panel')).toBeInTheDocument()
    })
  })

  describe('Multi-select handling', () => {
    it('remains stable when multiple nodes selected', () => {
      mockStoreState.nodes = [
        { id: 'node-1', type: 'OBSERVATION', position: { x: 0, y: 0 }, data: { text_content: 'test1' } },
        { id: 'node-2', type: 'MECHANISM', position: { x: 100, y: 0 }, data: { text_content: 'test2' } }
      ]

      const onClose = vi.fn()
      render(
        <InspectorPanel isOpen={true} onClose={onClose}>
          <InspectorAiActions nodeId="node-1" />
        </InspectorPanel>
      )

      expect(screen.getByTestId('inspector-panel')).toBeInTheDocument()
      expect(onClose).not.toHaveBeenCalled()
    })
  })

  describe('Esc key with selected node preserved', () => {
    it('closes inspector but preserves node selection state', () => {
      const onClose = vi.fn()
      render(
        <InspectorPanel isOpen={true} onClose={onClose}>
          <InspectorAiActions nodeId="node-1" />
        </InspectorPanel>
      )

      const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
      window.dispatchEvent(event)

      expect(onClose).toHaveBeenCalledTimes(1)
      expect(mockStoreState.nodes).toHaveLength(1)
      expect(mockStoreState.nodes[0].id).toBe('node-1')
    })

    it('does not modify node data when closing with Esc', () => {
      const originalNode = { ...mockStoreState.nodes[0] }
      const onClose = vi.fn()
      
      render(
        <InspectorPanel isOpen={true} onClose={onClose}>
          <InspectorAiActions nodeId="node-1" />
        </InspectorPanel>
      )

      const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
      window.dispatchEvent(event)

      expect(mockStoreState.nodes[0]).toEqual(originalNode)
    })
  })
})
