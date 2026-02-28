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
import * as chatDb from '@/lib/db/chat-db'

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
  __resetChatDbMock: vi.fn(),
  getThread: vi.fn().mockResolvedValue(undefined),
  saveThread: vi.fn().mockResolvedValue(undefined),
  createThreadV2: vi.fn(),
  listThreadsV2: vi.fn(),
  getActiveThreadId: vi.fn(),
  setActiveThreadId: vi.fn(),
  appendTurn: vi.fn(),
  appendVariant: vi.fn(),
  updateVariant: vi.fn(),
  listTurnsWithVariants: vi.fn(),
  setSelectedVariant: vi.fn(),
  setProposalStatus: vi.fn(),
  updateThreadTitle: vi.fn(),
}))

type MockThread = {
  id: string
  nodeId: string
  title: string
  createdAt: number
  updatedAt: number
}

type MockTurn = {
  id: string
  threadId: string
  seq: number
  userText: string
  userCreatedAt: number
  selectedVariantOrdinal: number | null
}

type MockVariant = {
  id: string
  turnId: string
  ordinal: number
  status: 'streaming' | 'complete' | 'error' | 'aborted'
  mode: 'answer' | 'proposal'
  contentText: string
  proposal?: {
    title: string
    content: string
    rationale: string
    confidence?: number
    diffSummary?: string
  }
  proposalStatus?: 'pending' | 'accepted' | 'rejected'
  createdAt: number
  updatedAt: number
}

const chatDbState: {
  threads: MockThread[]
  turns: MockTurn[]
  variants: MockVariant[]
  activeByNode: Record<string, string>
  counter: number
} = {
  threads: [],
  turns: [],
  variants: [],
  activeByNode: {},
  counter: 0,
}

const nextId = (prefix: string) => {
  chatDbState.counter += 1
  return `${prefix}-${chatDbState.counter}`
}

const resetChatDbState = () => {
  chatDbState.threads = []
  chatDbState.turns = []
  chatDbState.variants = []
  chatDbState.activeByNode = {}
  chatDbState.counter = 0
}

const setupChatDbMock = () => {
  const chatDbMock = chatDb as unknown as {
    __resetChatDbMock: ReturnType<typeof vi.fn>
    createThreadV2: ReturnType<typeof vi.fn>
    listThreadsV2: ReturnType<typeof vi.fn>
    getActiveThreadId: ReturnType<typeof vi.fn>
    setActiveThreadId: ReturnType<typeof vi.fn>
    appendTurn: ReturnType<typeof vi.fn>
    appendVariant: ReturnType<typeof vi.fn>
    updateVariant: ReturnType<typeof vi.fn>
    listTurnsWithVariants: ReturnType<typeof vi.fn>
    setSelectedVariant: ReturnType<typeof vi.fn>
    setProposalStatus: ReturnType<typeof vi.fn>
    updateThreadTitle: ReturnType<typeof vi.fn>
  }

  chatDbMock.__resetChatDbMock.mockImplementation(() => {
    resetChatDbState()
  })

  chatDbMock.createThreadV2.mockImplementation(async (nodeId: string, title?: string) => {
    const now = Date.now()
    const existingCount = chatDbState.threads.filter((thread) => thread.nodeId === nodeId).length
    const thread: MockThread = {
      id: nextId('thread'),
      nodeId,
      title: title ?? `Chat ${existingCount + 1}`,
      createdAt: now,
      updatedAt: now,
    }
    chatDbState.threads.push(thread)
    return thread
  })

  chatDbMock.listThreadsV2.mockImplementation(async (nodeId: string) =>
    chatDbState.threads
      .filter((thread) => thread.nodeId === nodeId)
      .sort((a, b) => b.updatedAt - a.updatedAt)
  )

  chatDbMock.getActiveThreadId.mockImplementation(async (nodeId: string) => chatDbState.activeByNode[nodeId])

  chatDbMock.setActiveThreadId.mockImplementation(async (nodeId: string, threadId: string) => {
    chatDbState.activeByNode[nodeId] = threadId
  })

  chatDbMock.appendTurn.mockImplementation(async (threadId: string, userText: string) => {
    const seq = chatDbState.turns.filter((turn) => turn.threadId === threadId).length
    const turn: MockTurn = {
      id: nextId('turn'),
      threadId,
      seq,
      userText,
      userCreatedAt: Date.now(),
      selectedVariantOrdinal: null,
    }
    chatDbState.turns.push(turn)
    return turn
  })

  chatDbMock.appendVariant.mockImplementation(async (turnId: string, data: Partial<MockVariant>) => {
    const existing = chatDbState.variants.filter((variant) => variant.turnId === turnId)
    const ordinal = existing.length > 0 ? Math.max(...existing.map((variant) => variant.ordinal)) + 1 : 0
    const variant: MockVariant = {
      id: nextId('variant'),
      turnId,
      ordinal,
      status: (data.status as MockVariant['status']) ?? 'streaming',
      mode: (data.mode as MockVariant['mode']) ?? 'answer',
      contentText: data.contentText ?? '',
      proposal: data.proposal,
      proposalStatus: data.proposalStatus,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    chatDbState.variants.push(variant)
    return variant
  })

  chatDbMock.updateVariant.mockImplementation(async (variantId: string, patch: Partial<MockVariant>) => {
    chatDbState.variants = chatDbState.variants.map((variant) =>
      variant.id === variantId ? { ...variant, ...patch, updatedAt: Date.now() } : variant
    )
  })

  chatDbMock.listTurnsWithVariants.mockImplementation(async (threadId: string) => {
    const turns = chatDbState.turns
      .filter((turn) => turn.threadId === threadId)
      .sort((a, b) => a.seq - b.seq)
    return turns.map((turn) => ({
      turn,
      variants: chatDbState.variants
        .filter((variant) => variant.turnId === turn.id)
        .sort((a, b) => a.ordinal - b.ordinal),
    }))
  })

  chatDbMock.setSelectedVariant.mockImplementation(async (turnId: string, ordinal: number) => {
    chatDbState.turns = chatDbState.turns.map((turn) =>
      turn.id === turnId ? { ...turn, selectedVariantOrdinal: ordinal } : turn
    )
  })

  chatDbMock.setProposalStatus.mockImplementation(async (variantId: string, status: MockVariant['proposalStatus']) => {
    chatDbState.variants = chatDbState.variants.map((variant) =>
      variant.id === variantId ? { ...variant, proposalStatus: status } : variant
    )
  })

  chatDbMock.updateThreadTitle.mockImplementation(async (threadId: string, title: string) => {
    chatDbState.threads = chatDbState.threads.map((thread) =>
      thread.id === threadId ? { ...thread, title, updatedAt: Date.now() } : thread
    )
  })
}

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
    setupChatDbMock()
    ;(chatDb as unknown as { __resetChatDbMock: () => void }).__resetChatDbMock()
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

  it('creates and activates a default thread on first send when chat opens without existing threads', async () => {
    render(<Page />)
    openChatFor('obs-1')

    await waitFor(() => {
      expect(screen.getByTestId('node-chat-panel')).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText('Ask about this node or request a revision...')
    fireEvent.change(input, { target: { value: 'Bootstrap first thread' } })

    mockFetchResponse({ mode: 'answer', answerText: 'Thread initialized.' })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => {
      expect(screen.getByText('Thread initialized.')).toBeInTheDocument()
    })

    const createThreadV2Mock = (chatDb as unknown as { createThreadV2: ReturnType<typeof vi.fn> })
      .createThreadV2
    const setActiveThreadIdMock = (chatDb as unknown as {
      setActiveThreadId: ReturnType<typeof vi.fn>
    }).setActiveThreadId

    expect(createThreadV2Mock).toHaveBeenCalledWith('obs-1')
    expect(setActiveThreadIdMock).toHaveBeenCalledWith('obs-1', expect.stringMatching(/^thread-/))
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
