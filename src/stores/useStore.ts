import { create } from 'zustand'
import { addEdge, applyEdgeChanges, applyNodeChanges } from 'reactflow'
import type { Connection, EdgeChange, NodeChange } from 'reactflow'

import type { DbNode } from '@/lib/db'
import { db } from '@/lib/db'
import type { NodeData, NodeType, OMVEdge, OMVNode } from '@/types/nodes'

export type { NodeType, OMVNode } from '@/types/nodes'

let persistDelayMs = 300
let persistTimeout: ReturnType<typeof setTimeout> | null = null

const schedulePersist = (nodes: OMVNode[], edges: OMVEdge[]) => {
  const dbNodes: DbNode[] = nodes.map((node) => ({
    ...node,
    parentIds: [],
  }))
  if (persistTimeout) {
    clearTimeout(persistTimeout)
  }

  persistTimeout = setTimeout(() => {
    void db
      .transaction('rw', db.nodes, db.edges, async () => {
        await db.nodes.clear()
        await db.nodes.bulkAdd(dbNodes)
        await db.edges.clear()
        await db.edges.bulkAdd(edges)
      })
      .catch((error: unknown) => {
        console.error('Failed to persist canvas state:', error)
      })
  }, persistDelayMs)
}

export const setPersistDelay = (value: number) => {
  persistDelayMs = value
}

export interface StoreState {
  nodes: OMVNode[]
  edges: OMVEdge[]
  isLoading: boolean
  loadFromDb: () => Promise<void>
  addNode: (node: OMVNode) => void
  updateNode: (id: string, data: Partial<OMVNode>) => void
  updateNodeData: (id: string, data: Partial<NodeData>) => void
  deleteNode: (id: string) => void
  addEdge: (edge: OMVEdge) => void
  deleteEdge: (id: string) => void
  onNodesChange: (changes: NodeChange[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  onConnect: (connection: Connection) => void
}

export const useStore = create<StoreState>((set) => ({
  nodes: [],
  edges: [],
  isLoading: false,
  loadFromDb: async () => {
    set({ isLoading: true })
    const [dbNodes, edges] = await Promise.all([
      db.nodes.toArray(),
      db.edges.toArray(),
    ])
    const nodes = dbNodes.map(({ parentIds: _parentIds, ...node }) => node)
    set({ nodes, edges, isLoading: false })
  },
  addNode: (node) => {
    set((state) => {
      const nodes = [...state.nodes, node]
      schedulePersist(nodes, state.edges)
      return { nodes }
    })
  },
  updateNode: (id, data) => {
    set((state) => {
      const nodes = state.nodes.map((node) => {
        if (node.id !== id) return node
        const mergedData = data.data
          ? { ...node.data, ...data.data }
          : node.data
        return { ...node, ...data, data: mergedData }
      })
      schedulePersist(nodes, state.edges)
      return { nodes }
    })
  },
  updateNodeData: (id, data) => {
    set((state) => {
      const nodes = state.nodes.map((node) =>
        node.id === id
          ? {
              ...node,
              data: {
                ...node.data,
                ...data,
              },
            }
          : node
      )
      schedulePersist(nodes, state.edges)
      return { nodes }
    })
  },
  deleteNode: (id) => {
    set((state) => {
      const nodes = state.nodes.filter((node) => node.id !== id)
      schedulePersist(nodes, state.edges)
      return { nodes }
    })
  },
  addEdge: (edge) => {
    set((state) => {
      const edges = addEdge(edge, state.edges)
      schedulePersist(state.nodes, edges)
      return { edges }
    })
  },
  deleteEdge: (id) => {
    set((state) => {
      const edges = state.edges.filter((edge) => edge.id !== id)
      schedulePersist(state.nodes, edges)
      return { edges }
    })
  },
  onNodesChange: (changes) => {
    set((state) => {
      const nodes = applyNodeChanges(changes, state.nodes) as OMVNode[]
      schedulePersist(nodes, state.edges)
      return { nodes }
    })
  },
  onEdgesChange: (changes) => {
    set((state) => {
      const edges = applyEdgeChanges(changes, state.edges) as OMVEdge[]
      schedulePersist(state.nodes, edges)
      return { edges }
    })
  },
  onConnect: (connection) => {
    set((state) => {
      const edges = addEdge(connection, state.edges)
      schedulePersist(state.nodes, edges)
      return { edges }
    })
  }
}))
