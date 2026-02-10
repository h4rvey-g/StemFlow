import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Connection } from 'reactflow'

const persistDelay = 10

const createStore = async () => {
  vi.resetModules()
  const storeModule = await import('../stores/useStore')
  const { db } = await import('../lib/db')
  return { ...storeModule, db }
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
    const { useStore, db, setPersistDelay } = await createStore()

    await db.nodes.add({
      id: 'node-1',
      type: 'OBSERVATION',
      data: { text_content: 'loaded' },
      position: { x: 12, y: 24 },
      parentIds: []
    })
    await db.nodes.add({
      id: 'node-2',
      type: 'MECHANISM',
      data: { text_content: 'loaded-2' },
      position: { x: 30, y: 40 },
      parentIds: []
    })
    await db.edges.add({
      id: 'edge-1',
      source: 'node-1',
      target: 'node-2'
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

    const ghostNodes = [
      {
        id: 'ghost-1',
        type: 'GHOST' as const,
        position: { x: 10, y: 20 },
        data: {
          parentId: 'parent-1',
          suggestedType: 'OBSERVATION' as const,
          text_content: 'Ghost idea',
          ghostId: 'ghost-1',
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

    const ghost1 = {
      id: 'ghost-1',
      type: 'GHOST' as const,
      position: { x: 10, y: 20 },
      data: {
        parentId: 'parent-1',
        suggestedType: 'OBSERVATION' as const,
        text_content: 'Ghost note',
        ghostId: 'ghost-1',
      },
    }
    const ghost2 = {
      id: 'ghost-2',
      type: 'GHOST' as const,
      position: { x: 30, y: 40 },
      data: {
        parentId: 'parent-1',
        suggestedType: 'MECHANISM' as const,
        text_content: 'Ghost mechanism',
        ghostId: 'ghost-2',
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
