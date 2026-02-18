import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import Page from '../page'
import type { StoreState } from '@/stores/useStore'
import type { ProjectStore } from '@/stores/useProjectStore'
import { useStore } from '@/stores/useStore'

class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = ResizeObserver

class DOMMatrixReadOnlyMock {
  m11 = 1
  m12 = 0
  m21 = 0
  m22 = 1
  m41 = 0
  m42 = 0

  constructor(init?: string | number[]) {
    if (typeof init === 'string') {
      const matrixMatch = init.match(/matrix\(([^)]+)\)/)
      if (matrixMatch) {
        const values = matrixMatch[1].split(',').map((value) => Number(value.trim()))
        if (values.length === 6) {
          this.m11 = values[0]
          this.m12 = values[1]
          this.m21 = values[2]
          this.m22 = values[3]
          this.m41 = values[4]
          this.m42 = values[5]
        }
      }
    } else if (Array.isArray(init) && init.length >= 6) {
      this.m11 = init[0]
      this.m12 = init[1]
      this.m21 = init[2]
      this.m22 = init[3]
      this.m41 = init[4]
      this.m42 = init[5]
    }
  }

  inverse() {
    return new DOMMatrixReadOnlyMock()
  }

  multiply() {
    return new DOMMatrixReadOnlyMock()
  }

  toFloat32Array() {
    return new Float32Array([this.m11, this.m12, this.m21, this.m22, this.m41, this.m42])
  }

  toFloat64Array() {
    return new Float64Array([this.m11, this.m12, this.m21, this.m22, this.m41, this.m42])
  }

  toString() {
    return `matrix(${this.m11}, ${this.m12}, ${this.m21}, ${this.m22}, ${this.m41}, ${this.m42})`
  }

  static fromMatrix() {
    return new DOMMatrixReadOnlyMock()
  }

  static fromFloat32Array(array: Float32Array) {
    return new DOMMatrixReadOnlyMock(Array.from(array))
  }

  static fromFloat64Array(array: Float64Array) {
    return new DOMMatrixReadOnlyMock(Array.from(array))
  }
}

global.DOMMatrixReadOnly = DOMMatrixReadOnlyMock as typeof DOMMatrixReadOnly

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

vi.mock('@/stores/useProjectStore', () => {
  const projectStoreState: ProjectStore = {
    projects: [
      {
        id: 'project-1',
        name: 'Test project',
        created_at: new Date(),
        updated_at: new Date(),
      },
    ],
    activeProjectId: 'project-1',
    isLoaded: true,
    loadProjects: vi.fn().mockResolvedValue(undefined),
    createProject: vi.fn(),
    renameProject: vi.fn(),
    deleteProject: vi.fn(),
    setActiveProject: vi.fn(),
  }

  const useProjectStore = ((selector?: (state: ProjectStore) => unknown) =>
    (selector ? selector(projectStoreState) : projectStoreState)) as typeof import('@/stores/useProjectStore').useProjectStore

  useProjectStore.getState = () => projectStoreState

  return { useProjectStore }
})

describe('Canvas Inspector State Contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('inspector state is closed by default', () => {
    render(<Page />)
    const inspector = screen.queryByTestId('inspector-panel')
    expect(inspector).not.toBeInTheDocument()
  })

  it('opens inspector when a node is selected', () => {
    const state = useStore() as StoreState
    state.nodes = [
      {
        id: 'node-1',
        type: 'OBSERVATION',
        position: { x: 0, y: 0 },
        data: { text_content: 'Test observation' },
        selected: true,
      },
    ]

    render(<Page />)
    
    const inspector = screen.queryByTestId('inspector-panel')
    expect(inspector).toBeInTheDocument()
  })

  it('syncs inspector content when selected node changes', () => {
    const state = useStore() as StoreState
    state.nodes = [
      {
        id: 'node-1',
        type: 'OBSERVATION',
        position: { x: 0, y: 0 },
        data: { text_content: 'First node' },
        selected: true,
      },
    ]

    const { rerender } = render(<Page />)
    
    let inspector = screen.queryByTestId('inspector-panel')
    expect(inspector).toBeInTheDocument()
    expect(inspector).toHaveTextContent('First node')

    // Change selected node
    state.nodes = [
      {
        id: 'node-1',
        type: 'OBSERVATION',
        position: { x: 0, y: 0 },
        data: { text_content: 'First node' },
        selected: false,
      },
      {
        id: 'node-2',
        type: 'MECHANISM',
        position: { x: 100, y: 100 },
        data: { text_content: 'Second node' },
        selected: true,
      },
    ]

    rerender(<Page />)
    
    inspector = screen.queryByTestId('inspector-panel')
    expect(inspector).toBeInTheDocument()
    expect(inspector).toHaveTextContent('Second node')
  })

  it('closes inspector when no node is selected', () => {
    const state = useStore() as StoreState
    state.nodes = [
      {
        id: 'node-1',
        type: 'OBSERVATION',
        position: { x: 0, y: 0 },
        data: { text_content: 'Test' },
        selected: true,
      },
    ]

    const { rerender } = render(<Page />)
    
    let inspector = screen.queryByTestId('inspector-panel')
    expect(inspector).toBeInTheDocument()

    state.nodes = [
      {
        id: 'node-1',
        type: 'OBSERVATION',
        position: { x: 0, y: 0 },
        data: { text_content: 'Test' },
        selected: false,
      },
    ]

    rerender(<Page />)
    
    inspector = screen.queryByTestId('inspector-panel')
    expect(inspector).not.toBeInTheDocument()
  })

  it('does not persist inspector state to localStorage', () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')
    
    const state = useStore() as StoreState
    state.nodes = [
      {
        id: 'node-1',
        type: 'OBSERVATION',
        position: { x: 0, y: 0 },
        data: { text_content: 'Test' },
        selected: true,
      },
    ]

    render(<Page />)
    
    // Check that no inspector-related keys were written
    const inspectorCalls = setItemSpy.mock.calls.filter(([key]) => 
      key.includes('inspector') || key.includes('Inspector')
    )
    
    expect(inspectorCalls).toHaveLength(0)
    
    setItemSpy.mockRestore()
  })

  it('does not add inspector state to Zustand store', () => {
    const state = useStore() as StoreState
    
    // Verify no inspector-related keys in store
    expect(state).not.toHaveProperty('inspectorOpen')
    expect(state).not.toHaveProperty('inspectorNodeId')
    expect(state).not.toHaveProperty('isInspectorOpen')
  })

  it('opens inspector when Read More intent event is dispatched', async () => {
    const state = useStore() as StoreState
    state.nodes = [
      {
        id: 'node-1',
        type: 'OBSERVATION',
        position: { x: 0, y: 0 },
        data: { text_content: 'Long text content that triggers read more' },
        selected: false,
      },
    ]

    render(<Page />)
    
    const event = new CustomEvent('stemflow:read-more-intent', {
      detail: { nodeId: 'node-1' }
    })
    window.dispatchEvent(event)

    await waitFor(() => {
      const inspector = screen.queryByTestId('inspector-panel')
      expect(inspector).toBeInTheDocument()
    })

    const inspector = screen.getByTestId('inspector-panel')
    expect(inspector).toHaveTextContent('Long text content that triggers read more')
  })

  it('closes inspector without deselecting node when Esc is pressed', () => {
    const state = useStore() as StoreState
    state.nodes = [
      {
        id: 'node-1',
        type: 'OBSERVATION',
        position: { x: 0, y: 0 },
        data: { text_content: 'Test' },
        selected: true,
      },
    ]

    render(<Page />)
    
    let inspector = screen.queryByTestId('inspector-panel')
    expect(inspector).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape' })

    inspector = screen.queryByTestId('inspector-panel')
    expect(inspector).not.toBeInTheDocument()
    
    expect(state.nodes[0].selected).toBe(true)
  })

  it('closes inspector when selected node is deleted', () => {
    const state = useStore() as StoreState
    state.nodes = [
      {
        id: 'node-1',
        type: 'OBSERVATION',
        position: { x: 0, y: 0 },
        data: { text_content: 'Test node' },
        selected: true,
      },
    ]

    const { rerender } = render(<Page />)
    
    let inspector = screen.queryByTestId('inspector-panel')
    expect(inspector).toBeInTheDocument()

    state.nodes = []

    rerender(<Page />)
    
    inspector = screen.queryByTestId('inspector-panel')
    expect(inspector).not.toBeInTheDocument()
  })

  it('closes inspector when selected node is removed from array', () => {
    const state = useStore() as StoreState
    state.nodes = [
      {
        id: 'node-1',
        type: 'OBSERVATION',
        position: { x: 0, y: 0 },
        data: { text_content: 'First' },
        selected: true,
      },
      {
        id: 'node-2',
        type: 'MECHANISM',
        position: { x: 100, y: 0 },
        data: { text_content: 'Second' },
        selected: false,
      },
    ]

    const { rerender } = render(<Page />)
    
    let inspector = screen.queryByTestId('inspector-panel')
    expect(inspector).toBeInTheDocument()
    expect(inspector).toHaveTextContent('First')

    state.nodes = [
      {
        id: 'node-2',
        type: 'MECHANISM',
        position: { x: 100, y: 0 },
        data: { text_content: 'Second' },
        selected: false,
      },
    ]

    rerender(<Page />)
    
    inspector = screen.queryByTestId('inspector-panel')
    expect(inspector).not.toBeInTheDocument()
  })

  it('closes inspector when multiple nodes are selected simultaneously', () => {
    const state = useStore() as StoreState
    state.nodes = [
      {
        id: 'node-1',
        type: 'OBSERVATION',
        position: { x: 0, y: 0 },
        data: { text_content: 'First observation' },
        selected: true,
      },
    ]

    const { rerender } = render(<Page />)

    let inspector = screen.queryByTestId('inspector-panel')
    expect(inspector).toBeInTheDocument()

    state.nodes = [
      {
        id: 'node-1',
        type: 'OBSERVATION',
        position: { x: 0, y: 0 },
        data: { text_content: 'First observation' },
        selected: true,
      },
      {
        id: 'node-2',
        type: 'MECHANISM',
        position: { x: 100, y: 0 },
        data: { text_content: 'Second mechanism' },
        selected: true,
      },
    ]

    rerender(<Page />)

    inspector = screen.queryByTestId('inspector-panel')
    expect(inspector).not.toBeInTheDocument()
  })

  it('re-opens inspector when multi-select reduces to single selection', () => {
    const state = useStore() as StoreState
    state.nodes = [
      {
        id: 'node-1',
        type: 'OBSERVATION',
        position: { x: 0, y: 0 },
        data: { text_content: 'First observation' },
        selected: true,
      },
      {
        id: 'node-2',
        type: 'MECHANISM',
        position: { x: 100, y: 0 },
        data: { text_content: 'Second mechanism' },
        selected: true,
      },
    ]

    const { rerender } = render(<Page />)

    let inspector = screen.queryByTestId('inspector-panel')
    expect(inspector).not.toBeInTheDocument()

    state.nodes = [
      {
        id: 'node-1',
        type: 'OBSERVATION',
        position: { x: 0, y: 0 },
        data: { text_content: 'First observation' },
        selected: true,
      },
      {
        id: 'node-2',
        type: 'MECHANISM',
        position: { x: 100, y: 0 },
        data: { text_content: 'Second mechanism' },
        selected: false,
      },
    ]

    rerender(<Page />)

    inspector = screen.queryByTestId('inspector-panel')
    expect(inspector).toBeInTheDocument()
    expect(inspector).toHaveTextContent('First observation')
  })

  it('does not persist inspector state to IndexedDB', () => {
    const state = useStore() as StoreState
    const storeKeys = Object.keys(state)

    const inspectorKeys = storeKeys.filter(
      (key) => key.toLowerCase().includes('inspector')
    )
    expect(inspectorKeys).toHaveLength(0)

    expect(state).not.toHaveProperty('inspectorNodeId')
    expect(state).not.toHaveProperty('inspectorOpen')
    expect(state).not.toHaveProperty('isInspectorOpen')
    expect(state).not.toHaveProperty('inspectorState')
  })
})
