/**
 * Integration tests for node chat panel.
 *
 * Scope: page-level event wiring → NodeChatPanel rendering → useNodeChat hook → store updates.
 * The real useNodeChat hook runs; only external I/O (fetch, IndexedDB, api-keys) is mocked.
 */
import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

import Page from '../page'
import type { StoreState } from '@/stores/useStore'
import { useStore } from '@/stores/useStore'
import { useChatStore } from '@/stores/useChatStore'
import type { ChatResponse } from '@/types/chat'
import type { ProjectStore } from '@/stores/useProjectStore'

// ---------------------------------------------------------------------------
// Browser API polyfills required for React Flow in JSDOM
// ---------------------------------------------------------------------------
class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = ResizeObserver

// ReactFlow uses DOMMatrixReadOnly for node transforms – polyfill for JSDOM
class DOMMatrixReadOnlyMock {
  m11 = 1; m12 = 0; m21 = 0; m22 = 1; m41 = 0; m42 = 0
  constructor(init?: string | number[]) {
    if (typeof init === 'string') {
      const m = init.match(/matrix\(([^)]+)\)/)
      if (m) {
        const v = m[1].split(',').map((x) => Number(x.trim()))
        if (v.length === 6) { this.m11=v[0]; this.m12=v[1]; this.m21=v[2]; this.m22=v[3]; this.m41=v[4]; this.m42=v[5] }
      }
    } else if (Array.isArray(init) && init.length >= 6) {
      [this.m11, this.m12, this.m21, this.m22, this.m41, this.m42] = init
    }
  }
  inverse() { return new DOMMatrixReadOnlyMock() }
  multiply() { return new DOMMatrixReadOnlyMock() }
  toFloat32Array() { return new Float32Array([this.m11,this.m12,this.m21,this.m22,this.m41,this.m42]) }
  toFloat64Array() { return new Float64Array([this.m11,this.m12,this.m21,this.m22,this.m41,this.m42]) }
  toString() { return `matrix(${this.m11},${this.m12},${this.m21},${this.m22},${this.m41},${this.m42})` }
  static fromMatrix() { return new DOMMatrixReadOnlyMock() }
  static fromFloat32Array(a: Float32Array) { return new DOMMatrixReadOnlyMock(Array.from(a)) }
  static fromFloat64Array(a: Float64Array) { return new DOMMatrixReadOnlyMock(Array.from(a)) }
}
global.DOMMatrixReadOnly = DOMMatrixReadOnlyMock as typeof DOMMatrixReadOnly

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: 'bright', setTheme: vi.fn() }),
}))

/** Deterministic API-key config used by useNodeChat */
vi.mock('@/lib/api-keys', () => ({
  loadApiKeys: vi.fn().mockResolvedValue({
    provider: 'openai',
    openaiKey: 'sk-test-key',
    anthropicKey: null,
    geminiKey: null,
    openaiBaseUrl: null,
    anthropicBaseUrl: null,
    openaiModel: 'gpt-4o',
    anthropicModel: null,
    geminiModel: null,
    openaiFastModel: null,
    anthropicFastModel: null,
    geminiFastModel: null,
    aiStreamingEnabled: true,
  }),
}))

/** Stub out Dexie chat persistence – not relevant to UI integration flow */
vi.mock('@/lib/db/chat-db', () => ({
  getThread: vi.fn().mockResolvedValue(undefined),
  saveThread: vi.fn().mockResolvedValue(undefined),
}))

/**
 * Mock useStore with:
 *  - A pre-seeded OBSERVATION node for useNodeChat to operate on.
 *  - `getState()` so the hook can access nodes/updateNodeData at call-time.
 */
vi.mock('@/stores/useStore', () => {
  const state: StoreState = {
    nodes: [
      {
        id: 'obs-1',
        type: 'OBSERVATION',
        position: { x: 0, y: 0 },
        data: { text_content: 'Original node content for testing' },
        selected: false,
      },
    ],
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
    createPendingNodeFromGhost: vi.fn(() => null),
    hydratePendingNode: vi.fn(),
    updatePendingNodeStreamingText: vi.fn(),
    markPendingNodeError: vi.fn(),
    retryPendingNodeGeneration: vi.fn(() => false),
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

  // Attach getState so useNodeChat can call useStore.getState().nodes / .updateNodeData
  const useStore = Object.assign(
    <T,>(selector?: (s: StoreState) => T) =>
      selector ? selector(state) : (state as unknown as T),
    { getState: () => state }
  )

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
  const projectState: ProjectStore = {
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
    selector
      ? selector(projectState)
      : projectState) as typeof import('@/stores/useProjectStore').useProjectStore

  useProjectStore.getState = () => projectState

  return { useProjectStore }
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Dispatch the custom event that opens the chat panel for a node */
const openChatFor = (nodeId: string) => {
  window.dispatchEvent(
    new CustomEvent('stemflow:open-chat', { detail: { nodeId } })
  )
}

/** Stub a deterministic fetch response for the /api/ai/chat endpoint */
const mockFetchResponse = (body: ChatResponse, status = 200) => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Node Chat Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset ephemeral chat store so no stale pending-proposal bleeds into next test
    useChatStore.getState().closeChat()
  })

  // ── 1. Panel open/close via event wiring ────────────────────────────────

  it('chat panel is not visible before stemflow:open-chat event fires', () => {
    render(<Page />)
    expect(screen.queryByTestId('node-chat-panel')).not.toBeInTheDocument()
  })

  it('opens chat panel scoped to correct node when stemflow:open-chat event is dispatched', async () => {
    render(<Page />)

    openChatFor('obs-1')

    await waitFor(() => {
      expect(screen.getByTestId('node-chat-panel')).toBeInTheDocument()
    })

    // Panel header identifies the node
    expect(screen.getByText(/Node obs-1/)).toBeInTheDocument()
  })

  it('closes chat panel when close button is clicked', async () => {
    render(<Page />)
    openChatFor('obs-1')

    await waitFor(() =>
      expect(screen.getByTestId('node-chat-panel')).toBeInTheDocument()
    )

    fireEvent.click(screen.getByRole('button', { name: 'Close chat panel' }))

    await waitFor(() =>
      expect(screen.queryByTestId('node-chat-panel')).not.toBeInTheDocument()
    )
  })

  // ── 2. Answer response flow ─────────────────────────────────────────────

  it('sends user question and displays AI answer in the panel', async () => {
    mockFetchResponse({ mode: 'answer', answerText: 'Mitosis is the process of cell division.' })

    render(<Page />)
    openChatFor('obs-1')

    await waitFor(() =>
      expect(screen.getByTestId('node-chat-panel')).toBeInTheDocument()
    )

    const input = screen.getByPlaceholderText(
      'Ask about this node or request a revision...'
    )
    fireEvent.change(input, { target: { value: 'What does this node describe?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    // User message should appear immediately
    await waitFor(() =>
      expect(screen.getByText('What does this node describe?')).toBeInTheDocument()
    )

    // AI answer should appear once fetch resolves
    await waitFor(() =>
      expect(
        screen.getByText('Mitosis is the process of cell division.')
      ).toBeInTheDocument()
    )

    // No proposal section for answer mode
    expect(screen.queryByText('Pending proposal')).not.toBeInTheDocument()
  })

  // ── 3. Proposal response flow ────────────────────────────────────────────

  it('sends rewrite request and renders proposal review UI', async () => {
    mockFetchResponse({
      mode: 'proposal',
      proposal: {
        title: 'Clearer observation statement',
        content: 'Refined content with higher specificity',
        rationale: 'Improves readability and precision',
        confidence: 0.9,
      },
    })

    render(<Page />)
    openChatFor('obs-1')

    await waitFor(() =>
      expect(screen.getByTestId('node-chat-panel')).toBeInTheDocument()
    )

    const input = screen.getByPlaceholderText(
      'Ask about this node or request a revision...'
    )
    fireEvent.change(input, { target: { value: 'Please rewrite this more clearly' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    // Proposal section should appear with title, rationale, and action buttons
    await waitFor(() =>
      expect(screen.getByText('Pending proposal')).toBeInTheDocument()
    )

    expect(screen.getByText('Clearer observation statement')).toBeInTheDocument()
    expect(screen.getByText('Improves readability and precision')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Accept' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument()
  })

  // ── 4. Accept proposal → updateNodeData ──────────────────────────────────

  it('accepting proposal calls updateNodeData with proposed content', async () => {
    mockFetchResponse({
      mode: 'proposal',
      proposal: {
        title: 'Updated content',
        content: 'This is the accepted replacement content',
        rationale: 'Scientifically more accurate',
      },
    })

    render(<Page />)
    openChatFor('obs-1')

    await waitFor(() =>
      expect(screen.getByTestId('node-chat-panel')).toBeInTheDocument()
    )

    const input = screen.getByPlaceholderText(
      'Ask about this node or request a revision...'
    )
    fireEvent.change(input, { target: { value: 'Revise the node content' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Accept' })).toBeInTheDocument()
    )

    fireEvent.click(screen.getByRole('button', { name: 'Accept' }))

    // updateNodeData should have been called through useNodeChat → acceptProposal
    const state = useStore() as StoreState
    await waitFor(() => {
      expect(state.updateNodeData).toHaveBeenCalledWith('obs-1', {
        text_content: 'This is the accepted replacement content',
      })
    })

    // Proposal section should disappear after acceptance
    await waitFor(() =>
      expect(screen.queryByText('Pending proposal')).not.toBeInTheDocument()
    )
  })

  // ── 5. Negative path: API error ───────────────────────────────────────────

  it('displays error message in panel when API call fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Service temporarily unavailable' }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      })
    )

    render(<Page />)
    openChatFor('obs-1')

    await waitFor(() =>
      expect(screen.getByTestId('node-chat-panel')).toBeInTheDocument()
    )

    const input = screen.getByPlaceholderText(
      'Ask about this node or request a revision...'
    )
    fireEvent.change(input, { target: { value: 'Test question' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    // Error should surface in the panel without a proposal appearing
    await waitFor(() =>
      expect(
        screen.getByText(/Service temporarily unavailable/)
      ).toBeInTheDocument()
    )

    expect(screen.queryByText('Pending proposal')).not.toBeInTheDocument()
    // updateNodeData must NOT have been called on error
    const state = useStore() as StoreState
    expect(state.updateNodeData).not.toHaveBeenCalled()
  })
})
