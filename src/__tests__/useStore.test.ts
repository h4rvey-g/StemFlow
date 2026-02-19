import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'
import type { Connection } from 'reactflow'
import type { GhostNode, GenerationStatus } from '../types/nodes'

const pendingGenerationStatus: GenerationStatus = 'pending'

const createGhostNode = (overrides?: Partial<GhostNode>): GhostNode => ({
  id: 'ghost-1',
  type: 'GHOST',
  position: { x: 50, y: 60 },
  data: {
    parentId: 'parent-1',
    suggestedType: 'VALIDATION',
    ghostId: 'ghost-1',
    plannerDirection: {
      id: 'ghost-1-direction',
      summary_title: 'Ghost validation',
      suggestedType: 'VALIDATION',
      searchQuery: 'Ghost validation',
    },
    generationStatus: pendingGenerationStatus,
  },
  ...overrides,
})

const createStore = async () => {
  vi.resetModules()
  const storeModule = await import('../stores/useStore')
  const projectModule = await import('../stores/useProjectStore')
  const { db } = await import('../lib/db')
  return { ...storeModule, useProjectStore: projectModule.useProjectStore, db }
}

const flushPromises = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

describe('useStore', () => {

  it('starts with empty state', async () => {
    const { useStore } = await createStore()
    const state = useStore.getState()

    expect(state.nodes).toEqual([])
    expect(state.edges).toEqual([])
  })

  it('adds, updates, and deletes nodes', async () => {
    const { useStore } = await createStore()
    const node = {
      id: 'node-1',
      type: 'OBSERVATION' as const,
      data: { text_content: 'initial' },
      position: { x: 0, y: 0 }
    }

    useStore.getState().addNode(node)
    expect(useStore.getState().nodes).toHaveLength(1)

    useStore.getState().updateNode('node-1', {
      data: { text_content: 'updated' }
    })
    expect(useStore.getState().nodes[0]?.data.text_content).toBe('updated')

    useStore.getState().deleteNode('node-1')
    expect(useStore.getState().nodes).toHaveLength(0)
  })

  it('onNodesChange updates node position', async () => {
    const { useStore } = await createStore()
    const node = {
      id: 'node-1',
      type: 'OBSERVATION' as const,
      data: { text_content: 'initial' },
      position: { x: 0, y: 0 }
    }

    useStore.getState().addNode(node)
    useStore.getState().onNodesChange([
      {
        id: 'node-1',
        type: 'position',
        position: { x: 50, y: 80 }
      }
    ])

    expect(useStore.getState().nodes[0]?.position).toEqual({ x: 50, y: 80 })
  })

  it('onConnect creates new edges', async () => {
    const { useStore } = await createStore()
    const connection: Connection = {
      source: 'node-1',
      target: 'node-2',
      sourceHandle: 'source',
      targetHandle: 'target'
    }

    useStore.getState().onConnect(connection)

    expect(useStore.getState().edges).toHaveLength(1)
    expect(useStore.getState().edges[0]?.source).toBe('node-1')
    expect(useStore.getState().edges[0]?.target).toBe('node-2')
  })

  it('loads data from Dexie and persists changes', async () => {
    const { useStore, useProjectStore, db, setPersistDelay } = await createStore()

    const testProjectId = 'test-project'
    await db.projects.add({
      id: testProjectId,
      name: 'Test Project',
      created_at: new Date(),
      updated_at: new Date()
    })
    useProjectStore.getState().setActiveProject(testProjectId)

    await db.nodes.add({
      id: 'node-1',
      type: 'OBSERVATION',
      data: { text_content: 'loaded' },
      position: { x: 12, y: 24 },
      parentIds: [],
      projectId: testProjectId
    })
    await db.nodes.add({
      id: 'node-2',
      type: 'MECHANISM',
      data: { text_content: 'loaded-2' },
      position: { x: 30, y: 40 },
      parentIds: [],
      projectId: testProjectId
    })
    await db.edges.add({
      id: 'edge-1',
      source: 'node-1',
      target: 'node-2',
      type: 'default',
      projectId: testProjectId
    })

    vi.useRealTimers()
    try {
      setPersistDelay(1)
      await useStore.getState().loadFromDb()

      expect(useStore.getState().nodes).toHaveLength(2)
      expect(useStore.getState().edges).toHaveLength(1)

      useStore.getState().updateNodeData('node-2', { text_content: 'persisted' })

      await new Promise((resolve) => setTimeout(resolve, 10))
      await flushPromises()

      const nodes = await db.nodes.toArray()
      expect(nodes).toHaveLength(2)

      const node2 = await db.nodes.get('node-2')
      expect(node2?.parentIds).toEqual(['node-1'])
    } finally {
      vi.useFakeTimers()
    }
  })

  it('sets ghost nodes', async () => {
    const { useStore } = await createStore()

    const ghostNodes: GhostNode[] = [
      {
        id: 'ghost-1',
        type: 'GHOST' as const,
        position: { x: 10, y: 20 },
        data: {
          parentId: 'parent-1',
          suggestedType: 'OBSERVATION' as const,
          text_content: 'Ghost idea',
          ghostId: 'ghost-1',
          plannerDirection: {
            id: 'ghost-1-direction',
            summary_title: 'Ghost idea',
            suggestedType: 'OBSERVATION' as const,
            searchQuery: 'Ghost idea',
          },
          generationStatus: pendingGenerationStatus,
        },
      }
    ]

    useStore.getState().setGhostNodes(ghostNodes)

    expect(useStore.getState().ghostNodes).toEqual(ghostNodes)
  })

  it('accepts ghost nodes into real nodes and edges', async () => {
    const { useStore } = await createStore()

    useStore.getState().addNode({
      id: 'parent-1',
      type: 'MECHANISM',
      data: { text_content: 'Parent' },
      position: { x: 0, y: 0 }
    })

    useStore.getState().setGhostNodes([
      {
        id: 'ghost-1',
        type: 'GHOST' as const,
        position: { x: 50, y: 60 },
        data: {
          parentId: 'parent-1',
          suggestedType: 'VALIDATION' as const,
          text_content: 'Ghost validation',
          ghostId: 'ghost-1',
          plannerDirection: {
            id: 'ghost-1-direction',
            summary_title: 'Ghost validation',
            suggestedType: 'VALIDATION' as const,
            searchQuery: 'Ghost validation',
          },
          generationStatus: pendingGenerationStatus,
        },
      }
    ])

    useStore.getState().acceptGhostNode('ghost-1')

    const state = useStore.getState()
    const newNode = state.nodes.find((node) => node.id.startsWith('node-'))

    expect(state.ghostNodes).toEqual([])
    expect(newNode).toBeDefined()
    expect(newNode?.type).toBe('VALIDATION')
    expect(newNode?.data.text_content).toBe('Ghost validation')
    expect(state.edges).toHaveLength(1)
    expect(state.edges[0]?.source).toBe('parent-1')
    expect(state.edges[0]?.target).toBe(newNode?.id)
  })

  it('creates a pending node from an accepted ghost and links graph', async () => {
    const { useStore } = await createStore()

    useStore.getState().addNode({
      id: 'parent-1',
      type: 'MECHANISM',
      data: { text_content: 'Parent' },
      position: { x: 0, y: 0 },
    })

    const ghostNode = createGhostNode({
      data: {
        parentId: 'parent-1',
        suggestedType: 'VALIDATION',
        ghostId: 'ghost-1',
        plannerDirection: {
          id: 'ghost-1-direction',
          summary_title: 'Ghost validation',
          suggestedType: 'VALIDATION',
          searchQuery: 'Ghost validation',
        },
        generationStatus: pendingGenerationStatus,
      },
    })

    useStore.getState().setGhostSuggestions([ghostNode], [
      {
        id: 'ghost-edge-parent-1-ghost-1',
        source: 'parent-1',
        target: 'ghost-1',
      },
    ])

    const pendingNodeId = useStore.getState().createPendingNodeFromGhost('ghost-1')
    const state = useStore.getState()

    expect(pendingNodeId).toBeTruthy()
    expect(state.ghostNodes).toEqual([])
    expect(state.ghostEdges).toEqual([])

    const pendingNode = state.nodes.find((node) => node.id === pendingNodeId)
    expect(pendingNode?.type).toBe('VALIDATION')
    expect(pendingNode?.data.text_content).toBe('Ghost validation')
    expect(pendingNode?.data.generationStatus).toBe('pending')
    expect(pendingNode?.data.sourceGhostId).toBe('ghost-1')

    expect(state.edges.some((edge) => edge.source === 'parent-1' && edge.target === pendingNodeId)).toBe(true)
  })

  it('multi-accept safety: accepting two different ghosts creates two independent pending nodes', async () => {
    const { useStore } = await createStore()

    useStore.getState().addNode({
      id: 'parent-1',
      type: 'MECHANISM',
      data: { text_content: 'Parent' },
      position: { x: 0, y: 0 },
    })

    const ghostOne = createGhostNode({
      id: 'ghost-1',
      data: {
        parentId: 'parent-1',
        suggestedType: 'VALIDATION',
        ghostId: 'ghost-1',
        plannerDirection: {
          id: 'ghost-1-direction',
          summary_title: 'Ghost validation one',
          suggestedType: 'VALIDATION',
          searchQuery: 'Ghost validation one',
        },
        generationStatus: pendingGenerationStatus,
      },
    })
    const ghostTwo = createGhostNode({
      id: 'ghost-2',
      position: { x: 60, y: 120 },
      data: {
        parentId: 'parent-1',
        suggestedType: 'OBSERVATION',
        ghostId: 'ghost-2',
        plannerDirection: {
          id: 'ghost-2-direction',
          summary_title: 'Ghost observation two',
          suggestedType: 'OBSERVATION',
          searchQuery: 'Ghost observation two',
        },
        generationStatus: pendingGenerationStatus,
      },
    })

    useStore.getState().setGhostSuggestions(
      [ghostOne, ghostTwo],
      [
        {
          id: 'ghost-edge-parent-1-ghost-1',
          source: 'parent-1',
          target: 'ghost-1',
        },
        {
          id: 'ghost-edge-parent-1-ghost-2',
          source: 'parent-1',
          target: 'ghost-2',
        },
      ]
    )

    const pendingOne = useStore.getState().createPendingNodeFromGhost('ghost-1')
    const pendingTwo = useStore.getState().createPendingNodeFromGhost('ghost-2')
    const state = useStore.getState()

    expect(pendingOne).toBeTruthy()
    expect(pendingTwo).toBeTruthy()
    expect(pendingOne).not.toBe(pendingTwo)

    const pendingNodes = state.nodes.filter((node) =>
      node.id === pendingOne || node.id === pendingTwo
    )
    expect(pendingNodes).toHaveLength(2)
    expect(pendingNodes.every((node) => node.data.generationStatus === 'pending')).toBe(true)
    expect(new Set(pendingNodes.map((node) => node.data.sourceGhostId))).toEqual(new Set(['ghost-1', 'ghost-2']))
    expect(state.ghostNodes).toEqual([])
    expect(state.ghostEdges).toEqual([])
    expect(state.edges.filter((edge) => edge.source === 'parent-1')).toHaveLength(2)
  })

  it('out-of-order hydration safety: each completion updates only its own pending node', async () => {
    const { useStore } = await createStore()

    useStore.getState().addNode({
      id: 'parent-1',
      type: 'MECHANISM',
      data: { text_content: 'Parent' },
      position: { x: 0, y: 0 },
    })

    useStore.getState().setGhostNodes([
      createGhostNode({
        id: 'ghost-1',
        data: {
          parentId: 'parent-1',
          suggestedType: 'VALIDATION',
          ghostId: 'ghost-1',
          plannerDirection: {
            id: 'ghost-1-direction',
            summary_title: 'Ghost one',
            suggestedType: 'VALIDATION',
            searchQuery: 'Ghost one',
          },
          generationStatus: pendingGenerationStatus,
        },
      }),
      createGhostNode({
        id: 'ghost-2',
        data: {
          parentId: 'parent-1',
          suggestedType: 'OBSERVATION',
          ghostId: 'ghost-2',
          plannerDirection: {
            id: 'ghost-2-direction',
            summary_title: 'Ghost two',
            suggestedType: 'OBSERVATION',
            searchQuery: 'Ghost two',
          },
          generationStatus: pendingGenerationStatus,
        },
      }),
    ])

    const pendingOne = useStore.getState().createPendingNodeFromGhost('ghost-1')
    const pendingTwo = useStore.getState().createPendingNodeFromGhost('ghost-2')

    expect(pendingOne).toBeTruthy()
    expect(pendingTwo).toBeTruthy()

    useStore.getState().hydratePendingNode(pendingTwo as string, {
      text_content: 'Second completed first',
      summary_title: 'Second done',
      citations: [],
    })

    useStore.getState().hydratePendingNode(pendingOne as string, {
      text_content: 'First completed later',
      summary_title: 'First done',
      citations: [],
    })

    const state = useStore.getState()
    const hydratedOne = state.nodes.find((node) => node.id === pendingOne)
    const hydratedTwo = state.nodes.find((node) => node.id === pendingTwo)

    expect(hydratedOne?.data.text_content).toBe('First completed later')
    expect(hydratedOne?.data.summary_title).toBe('First done')
    expect(hydratedOne?.data.generationStatus).toBe('complete')

    expect(hydratedTwo?.data.text_content).toBe('Second completed first')
    expect(hydratedTwo?.data.summary_title).toBe('Second done')
    expect(hydratedTwo?.data.generationStatus).toBe('complete')
  })

  it('duplicate-accept safety: same ghost cannot create duplicate pending nodes', async () => {
    const { useStore } = await createStore()

    useStore.getState().addNode({
      id: 'parent-1',
      type: 'MECHANISM',
      data: { text_content: 'Parent' },
      position: { x: 0, y: 0 },
    })

    useStore.getState().setGhostNodes([
      createGhostNode({
        id: 'ghost-1',
        data: {
          parentId: 'parent-1',
          suggestedType: 'VALIDATION',
          ghostId: 'ghost-1',
          plannerDirection: {
            id: 'ghost-1-direction',
            summary_title: 'Ghost one',
            suggestedType: 'VALIDATION',
            searchQuery: 'Ghost one',
          },
          generationStatus: pendingGenerationStatus,
        },
      }),
    ])

    const firstPendingNodeId = useStore.getState().createPendingNodeFromGhost('ghost-1')
    const duplicatePendingNodeId = useStore.getState().createPendingNodeFromGhost('ghost-1')
    const state = useStore.getState()

    expect(firstPendingNodeId).toBeTruthy()
    expect(duplicatePendingNodeId).toBeNull()

    const nodesFromGhost = state.nodes.filter((node) => node.data.sourceGhostId === 'ghost-1')
    expect(nodesFromGhost).toHaveLength(1)
    expect(nodesFromGhost[0]?.id).toBe(firstPendingNodeId)
  })

  it('hydrates a pending node to complete with generated content', async () => {
    const { useStore } = await createStore()

    useStore.getState().addNode({
      id: 'parent-1',
      type: 'MECHANISM',
      data: { text_content: 'Parent' },
      position: { x: 0, y: 0 },
    })

    useStore.getState().setGhostNodes([
      createGhostNode({
        data: {
          parentId: 'parent-1',
          suggestedType: 'VALIDATION',
          ghostId: 'ghost-1',
          plannerDirection: {
            id: 'ghost-1-direction',
            summary_title: 'Ghost validation',
            suggestedType: 'VALIDATION',
            searchQuery: 'Ghost validation',
          },
          generationStatus: pendingGenerationStatus,
        },
      }),
    ])

    const pendingNodeId = useStore.getState().createPendingNodeFromGhost('ghost-1')
    expect(pendingNodeId).toBeTruthy()

    useStore.getState().hydratePendingNode(pendingNodeId as string, {
      text_content: 'Hydrated validation step',
      summary_title: 'Hydrated title',
      citations: [
        {
          index: 1,
          title: 'Paper 1',
          url: 'https://example.com/paper-1',
        },
      ],
    })

    const hydrated = useStore.getState().nodes.find((node) => node.id === pendingNodeId)
    expect(hydrated?.data.text_content).toBe('Hydrated validation step')
    expect(hydrated?.data.summary_title).toBe('Hydrated title')
    expect(hydrated?.data.generationStatus).toBe('complete')
    expect(hydrated?.data.generationError).toBeUndefined()
    expect(hydrated?.data.citations).toEqual([
      {
        index: 1,
        title: 'Paper 1',
        url: 'https://example.com/paper-1',
      },
    ])
  })

  it('keeps completed node stable when stale error arrives and preserves edge integrity', async () => {
    const { useStore } = await createStore()

    useStore.getState().addNode({
      id: 'parent-1',
      type: 'MECHANISM',
      data: { text_content: 'Parent' },
      position: { x: 0, y: 0 },
    })

    useStore.getState().setGhostNodes([
      createGhostNode({
        data: {
          parentId: 'parent-1',
          suggestedType: 'VALIDATION',
          ghostId: 'ghost-1',
          plannerDirection: {
            id: 'ghost-1-direction',
            summary_title: 'Ghost validation',
            suggestedType: 'VALIDATION',
            searchQuery: 'Ghost validation',
          },
          generationStatus: pendingGenerationStatus,
        },
      }),
    ])

    const pendingNodeId = useStore.getState().createPendingNodeFromGhost('ghost-1')
    expect(pendingNodeId).toBeTruthy()

    useStore.getState().hydratePendingNode(pendingNodeId as string, {
      text_content: 'Hydrated validation step',
      summary_title: 'Hydrated title',
      citations: [],
    })

    useStore.getState().markPendingNodeError(pendingNodeId as string, {
      message: 'Late error should be ignored',
      code: 'LATE_ERROR',
      retryable: true,
      provider: 'openai',
    })

    const state = useStore.getState()
    const hydratedNode = state.nodes.find((node) => node.id === pendingNodeId)

    expect(hydratedNode?.data.generationStatus).toBe('complete')
    expect(hydratedNode?.data.generationError).toBeUndefined()
    expect(state.edges.filter((edge) => edge.source === 'parent-1' && edge.target === pendingNodeId)).toHaveLength(1)
  })

  it('marks pending node as error with retry metadata and keeps edges', async () => {
    const { useStore } = await createStore()

    useStore.getState().addNode({
      id: 'parent-1',
      type: 'MECHANISM',
      data: { text_content: 'Parent' },
      position: { x: 0, y: 0 },
    })

    useStore.getState().setGhostNodes([
      createGhostNode({
        data: {
          parentId: 'parent-1',
          suggestedType: 'VALIDATION',
          ghostId: 'ghost-1',
          plannerDirection: {
            id: 'ghost-1-direction',
            summary_title: 'Ghost validation',
            suggestedType: 'VALIDATION',
            searchQuery: 'Ghost validation',
          },
          generationStatus: pendingGenerationStatus,
        },
      }),
    ])

    const pendingNodeId = useStore.getState().createPendingNodeFromGhost('ghost-1')
    expect(pendingNodeId).toBeTruthy()

    useStore.getState().markPendingNodeError(pendingNodeId as string, {
      message: 'Too Many Requests',
      code: 'RATE_LIMIT',
      retryable: true,
      provider: 'openai',
    })

    const state = useStore.getState()
    const failedNode = state.nodes.find((node) => node.id === pendingNodeId)
    expect(failedNode?.data.generationStatus).toBe('error')
    expect(failedNode?.data.generationError).toEqual({
      message: 'Too Many Requests',
      code: 'RATE_LIMIT',
      retryable: true,
      provider: 'openai',
    })
    expect(state.edges.some((edge) => edge.source === 'parent-1' && edge.target === pendingNodeId)).toBe(true)
  })

  it('keeps errored node stable when stale hydrate arrives and preserves edge integrity', async () => {
    const { useStore } = await createStore()

    useStore.getState().addNode({
      id: 'parent-1',
      type: 'MECHANISM',
      data: { text_content: 'Parent' },
      position: { x: 0, y: 0 },
    })

    useStore.getState().setGhostNodes([
      createGhostNode({
        data: {
          parentId: 'parent-1',
          suggestedType: 'VALIDATION',
          ghostId: 'ghost-1',
          plannerDirection: {
            id: 'ghost-1-direction',
            summary_title: 'Ghost validation',
            suggestedType: 'VALIDATION',
            searchQuery: 'Ghost validation',
          },
          generationStatus: pendingGenerationStatus,
        },
      }),
    ])

    const pendingNodeId = useStore.getState().createPendingNodeFromGhost('ghost-1')
    expect(pendingNodeId).toBeTruthy()

    useStore.getState().markPendingNodeError(pendingNodeId as string, {
      message: 'Too Many Requests',
      code: 'RATE_LIMIT',
      retryable: true,
      provider: 'openai',
    })

    useStore.getState().hydratePendingNode(pendingNodeId as string, {
      text_content: 'Stale success should be ignored',
      summary_title: 'Stale title',
      citations: [],
    })

    const state = useStore.getState()
    const failedNode = state.nodes.find((node) => node.id === pendingNodeId)

    expect(failedNode?.data.generationStatus).toBe('error')
    expect(failedNode?.data.generationError).toEqual({
      message: 'Too Many Requests',
      code: 'RATE_LIMIT',
      retryable: true,
      provider: 'openai',
    })
    expect(state.edges.filter((edge) => edge.source === 'parent-1' && edge.target === pendingNodeId)).toHaveLength(1)
  })

  it('retryable error recovery: retry transitions same node from error to pending', async () => {
    const { useStore } = await createStore()

    useStore.getState().addNode({
      id: 'parent-1',
      type: 'MECHANISM',
      data: { text_content: 'Parent' },
      position: { x: 0, y: 0 },
    })

    useStore.getState().setGhostNodes([
      createGhostNode({
        data: {
          parentId: 'parent-1',
          suggestedType: 'VALIDATION',
          ghostId: 'ghost-1',
          plannerDirection: {
            id: 'ghost-1-direction',
            summary_title: 'Ghost validation',
            suggestedType: 'VALIDATION',
            searchQuery: 'Ghost validation',
          },
          generationStatus: pendingGenerationStatus,
        },
      }),
    ])

    const pendingNodeId = useStore.getState().createPendingNodeFromGhost('ghost-1')
    expect(pendingNodeId).toBeTruthy()

    useStore.getState().markPendingNodeError(pendingNodeId as string, {
      message: 'Rate limit exceeded',
      code: 'rate_limit',
      retryable: true,
      provider: 'openai',
    })

    const retryStarted = useStore.getState().retryPendingNodeGeneration(pendingNodeId as string)
    const state = useStore.getState()
    const retriedNode = state.nodes.find((node) => node.id === pendingNodeId)

    expect(retryStarted).toBe(true)
    expect(retriedNode?.id).toBe(pendingNodeId)
    expect(retriedNode?.data.generationStatus).toBe('pending')
    expect(retriedNode?.data.generationError).toBeUndefined()
  })

  it('terminal error classification behavior: retry is guarded for non-retryable node error', async () => {
    const { useStore } = await createStore()

    useStore.getState().addNode({
      id: 'parent-1',
      type: 'MECHANISM',
      data: { text_content: 'Parent' },
      position: { x: 0, y: 0 },
    })

    useStore.getState().setGhostNodes([
      createGhostNode({
        data: {
          parentId: 'parent-1',
          suggestedType: 'VALIDATION',
          ghostId: 'ghost-1',
          plannerDirection: {
            id: 'ghost-1-direction',
            summary_title: 'Ghost validation',
            suggestedType: 'VALIDATION',
            searchQuery: 'Ghost validation',
          },
          generationStatus: pendingGenerationStatus,
        },
      }),
    ])

    const pendingNodeId = useStore.getState().createPendingNodeFromGhost('ghost-1')
    expect(pendingNodeId).toBeTruthy()

    useStore.getState().markPendingNodeError(pendingNodeId as string, {
      message: 'Invalid API key',
      code: 'auth',
      retryable: false,
      provider: 'openai',
    })

    const retryStarted = useStore.getState().retryPendingNodeGeneration(pendingNodeId as string)
    const state = useStore.getState()
    const terminalNode = state.nodes.find((node) => node.id === pendingNodeId)

    expect(retryStarted).toBe(false)
    expect(terminalNode?.data.generationStatus).toBe('error')
    expect(terminalNode?.data.generationError).toEqual({
      message: 'Invalid API key',
      code: 'auth',
      retryable: false,
      provider: 'openai',
    })
  })

  it('retry does not create duplicate node identity', async () => {
    const { useStore } = await createStore()

    useStore.getState().addNode({
      id: 'parent-1',
      type: 'MECHANISM',
      data: { text_content: 'Parent' },
      position: { x: 0, y: 0 },
    })

    useStore.getState().setGhostNodes([
      createGhostNode({
        data: {
          parentId: 'parent-1',
          suggestedType: 'VALIDATION',
          ghostId: 'ghost-1',
          plannerDirection: {
            id: 'ghost-1-direction',
            summary_title: 'Ghost validation',
            suggestedType: 'VALIDATION',
            searchQuery: 'Ghost validation',
          },
          generationStatus: pendingGenerationStatus,
        },
      }),
    ])

    const pendingNodeId = useStore.getState().createPendingNodeFromGhost('ghost-1')
    expect(pendingNodeId).toBeTruthy()

    useStore.getState().markPendingNodeError(pendingNodeId as string, {
      message: 'Rate limit exceeded',
      code: 'rate_limit',
      retryable: true,
      provider: 'openai',
    })

    const nodeCountBeforeRetry = useStore.getState().nodes.length
    const retried = useStore.getState().retryPendingNodeGeneration(pendingNodeId as string)
    const state = useStore.getState()

    expect(retried).toBe(true)
    expect(state.nodes.length).toBe(nodeCountBeforeRetry)
    expect(state.nodes.filter((node) => node.id === pendingNodeId)).toHaveLength(1)
  })

  it('accepts all ghost nodes into real nodes and clears suggestions', async () => {
    const { useStore } = await createStore()

    useStore.getState().addNode({
      id: 'parent-1',
      type: 'MECHANISM',
      data: { text_content: 'Parent' },
      position: { x: 0, y: 0 },
    })

    useStore.getState().setGhostSuggestions(
      [
        {
          id: 'ghost-1',
          type: 'GHOST',
          position: { x: 50, y: 60 },
          data: {
            parentId: 'parent-1',
            suggestedType: 'VALIDATION',
            text_content: 'Ghost validation',
            ghostId: 'ghost-1',
            plannerDirection: {
              id: 'ghost-1-direction',
              summary_title: 'Ghost validation',
              suggestedType: 'VALIDATION',
              searchQuery: 'Ghost validation',
            },
            generationStatus: pendingGenerationStatus,
          },
        },
        {
          id: 'ghost-2',
          type: 'GHOST',
          position: { x: 50, y: 120 },
          data: {
            parentId: 'parent-1',
            suggestedType: 'OBSERVATION',
            text_content: 'Ghost observation',
            ghostId: 'ghost-2',
            plannerDirection: {
              id: 'ghost-2-direction',
              summary_title: 'Ghost observation',
              suggestedType: 'OBSERVATION',
              searchQuery: 'Ghost observation',
            },
            generationStatus: pendingGenerationStatus,
          },
        },
      ],
      [
        {
          id: 'ghost-edge-parent-1-ghost-1',
          source: 'parent-1',
          target: 'ghost-1',
        },
        {
          id: 'ghost-edge-parent-1-ghost-2',
          source: 'parent-1',
          target: 'ghost-2',
        },
      ]
    )

    useStore.getState().acceptAllGhostNodes()

    const state = useStore.getState()
    const addedNodes = state.nodes.filter((node) => node.id.startsWith('node-'))

    expect(addedNodes).toHaveLength(2)
    expect(addedNodes.map((node) => node.type).sort()).toEqual(['OBSERVATION', 'VALIDATION'])
    expect(addedNodes.map((node) => node.data.text_content).sort()).toEqual([
      'Ghost observation',
      'Ghost validation',
    ])
    expect(state.ghostNodes).toEqual([])
    expect(state.ghostEdges).toEqual([])
    expect(state.edges).toHaveLength(2)
    expect(state.edges.every((edge) => edge.source === 'parent-1')).toBe(true)
    expect(new Set(state.edges.map((edge) => edge.target))).toEqual(new Set(addedNodes.map((node) => node.id)))
  })

  it('dismisses ghost nodes', async () => {
    const { useStore } = await createStore()

    const ghost1: GhostNode = {
      id: 'ghost-1',
      type: 'GHOST' as const,
      position: { x: 10, y: 20 },
      data: {
        parentId: 'parent-1',
        suggestedType: 'OBSERVATION' as const,
        text_content: 'Ghost note',
        ghostId: 'ghost-1',
        plannerDirection: {
          id: 'ghost-1-direction',
          summary_title: 'Ghost note',
          suggestedType: 'OBSERVATION' as const,
          searchQuery: 'Ghost note',
        },
      },
    }
    const ghost2: GhostNode = {
      id: 'ghost-2',
      type: 'GHOST' as const,
      position: { x: 30, y: 40 },
      data: {
        parentId: 'parent-1',
        suggestedType: 'MECHANISM' as const,
        text_content: 'Ghost mechanism',
        ghostId: 'ghost-2',
        plannerDirection: {
          id: 'ghost-2-direction',
          summary_title: 'Ghost mechanism',
          suggestedType: 'MECHANISM' as const,
          searchQuery: 'Ghost mechanism',
        },
      },
    }

    useStore.getState().setGhostNodes([ghost1, ghost2])

    useStore.getState().dismissGhostNode('ghost-1')

    expect(useStore.getState().ghostNodes).toEqual([ghost2])
  })

  it('updates generation and goal state', async () => {
    const { useStore } = await createStore()

    useStore.getState().setIsGenerating(true)
    useStore.getState().setAiError('Error')
    useStore.getState().setGlobalGoal('Focus on insights')

    expect(useStore.getState().isGenerating).toBe(true)
    expect(useStore.getState().aiError).toBe('Error')
    expect(useStore.getState().globalGoal).toBe('Focus on insights')

    useStore.getState().setIsGenerating(false)
    useStore.getState().setAiError(null)
    useStore.getState().setGlobalGoal('')

    expect(useStore.getState().isGenerating).toBe(false)
    expect(useStore.getState().aiError).toBeNull()
    expect(useStore.getState().globalGoal).toBe('')
  })

  it('sets per-node grades with clamping', async () => {
    const { useStore } = await createStore()

    useStore.getState().addNode({
      id: 'node-grade',
      type: 'OBSERVATION',
      data: { text_content: 'Needs evaluation' },
      position: { x: 0, y: 0 },
    })

    useStore.getState().setNodeGrade('node-grade', 4)
    expect(useStore.getState().nodes.find((node) => node.id === 'node-grade')?.data.grade).toBe(4)

    useStore.getState().setNodeGrade('node-grade', 8)
    expect(useStore.getState().nodes.find((node) => node.id === 'node-grade')?.data.grade).toBe(5)

    useStore.getState().setNodeGrade('node-grade', -1)
    expect(useStore.getState().nodes.find((node) => node.id === 'node-grade')?.data.grade).toBe(1)
  })

  it('undoes the latest added node', async () => {
    const { useStore } = await createStore()

    const node = {
      id: 'undo-add-1',
      type: 'OBSERVATION' as const,
      data: { text_content: 'undo me' },
      position: { x: 10, y: 20 },
    }

    useStore.getState().addNode(node)
    expect(useStore.getState().nodes).toHaveLength(1)

    useStore.getState().undoLastAction()
    expect(useStore.getState().nodes).toHaveLength(0)
  })

  it('undoes node deletion and restores connected edges', async () => {
    const { useStore } = await createStore()

    useStore.getState().addNode({
      id: 'undo-delete-source',
      type: 'OBSERVATION',
      data: { text_content: 'source' },
      position: { x: 0, y: 0 },
    })
    useStore.getState().addNode({
      id: 'undo-delete-target',
      type: 'MECHANISM',
      data: { text_content: 'target' },
      position: { x: 100, y: 0 },
    })
    useStore.getState().addEdge({
      id: 'undo-delete-edge',
      source: 'undo-delete-source',
      target: 'undo-delete-target',
    })

    useStore.getState().deleteNode('undo-delete-target')
    expect(useStore.getState().nodes.find((node) => node.id === 'undo-delete-target')).toBeUndefined()
    expect(useStore.getState().edges.find((edge) => edge.id === 'undo-delete-edge')).toBeUndefined()

    useStore.getState().undoLastAction()

    expect(useStore.getState().nodes.find((node) => node.id === 'undo-delete-target')).toBeDefined()
    expect(useStore.getState().edges.find((edge) => edge.id === 'undo-delete-edge')).toBeDefined()
  })

  it('undo restores edge when edge removal event happens before node removal', async () => {
    const { useStore } = await createStore()

    useStore.getState().addNode({
      id: 'undo-order-source',
      type: 'OBSERVATION',
      data: { text_content: 'source' },
      position: { x: 0, y: 0 },
    })
    useStore.getState().addNode({
      id: 'undo-order-target',
      type: 'MECHANISM',
      data: { text_content: 'target' },
      position: { x: 100, y: 0 },
    })
    useStore.getState().addEdge({
      id: 'undo-order-edge',
      source: 'undo-order-source',
      target: 'undo-order-target',
    })

    useStore.getState().onEdgesChange([
      {
        id: 'undo-order-edge',
        type: 'remove',
      },
    ])
    useStore.getState().onNodesChange([
      {
        id: 'undo-order-target',
        type: 'remove',
      },
    ])

    expect(useStore.getState().nodes.find((node) => node.id === 'undo-order-target')).toBeUndefined()
    expect(useStore.getState().edges.find((edge) => edge.id === 'undo-order-edge')).toBeUndefined()

    useStore.getState().undoLastAction()

    expect(useStore.getState().nodes.find((node) => node.id === 'undo-order-target')).toBeDefined()
    expect(useStore.getState().edges.find((edge) => edge.id === 'undo-order-edge')).toBeDefined()
  })
})
