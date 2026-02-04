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
    await db.edges.add({
      id: 'edge-1',
      source: 'node-1',
      target: 'node-2'
    })

    vi.useRealTimers()
    try {
      setPersistDelay(1)
      await useStore.getState().loadFromDb()

      expect(useStore.getState().nodes).toHaveLength(1)
      expect(useStore.getState().edges).toHaveLength(1)

      useStore.getState().addNode({
        id: 'node-2',
        type: 'MECHANISM',
        data: { text_content: 'persisted' },
        position: { x: 30, y: 40 }
      })

      await new Promise((resolve) => setTimeout(resolve, 10))
      await flushPromises()

      const nodes = await db.nodes.toArray()
      expect(nodes).toHaveLength(2)
    } finally {
      vi.useFakeTimers()
    }
  })
})
