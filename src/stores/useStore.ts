import { create } from 'zustand'
import { addEdge, applyEdgeChanges, applyNodeChanges } from 'reactflow'
import type { Connection, EdgeChange, NodeChange } from 'reactflow'

import type { DbNode } from '@/lib/db'
import { db } from '@/lib/db'
import type { GhostNode, GhostNodeData, NodeData, NodeType, OMVEdge, OMVNode } from '@/types/nodes'

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
  ghostNodes: GhostNode[]
  isGenerating: boolean
  aiError: string | null
  globalGoal: string
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
  setGhostNodes: (nodes: GhostNode[]) => void
  acceptGhostNode: (ghostId: string) => void
  dismissGhostNode: (ghostId: string) => void
  setIsGenerating: (value: boolean) => void
  setAiError: (error: string | null) => void
  setGlobalGoal: (goal: string) => void
  clearGhostNodes: () => void
}

export const useStore = create<StoreState>((set) => ({
  nodes: [],
  edges: [],
  ghostNodes: [],
  isGenerating: false,
  aiError: null,
  globalGoal: '',
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
      const ghostChanges = changes.filter(
        (change) => 'id' in change && typeof change.id === 'string' && change.id.startsWith('ghost-')
      )
      const nonGhostChanges = changes.filter(
        (change) => !('id' in change && typeof change.id === 'string' && change.id.startsWith('ghost-'))
      )

      const nodes = applyNodeChanges(nonGhostChanges, state.nodes) as OMVNode[]
      const ghostNodes = applyNodeChanges(ghostChanges, state.ghostNodes) as GhostNode[]

      schedulePersist(nodes, state.edges)
      return { nodes, ghostNodes }
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
  },
  setGhostNodes: (ghostNodes) => {
    console.log('[Store] setGhostNodes called with:', ghostNodes)
    set(() => {
      console.log('[Store] Setting ghostNodes in state')
      return { ghostNodes }
    })
  },
  acceptGhostNode: (ghostId) => {
    set((state) => {
      const ghostNode = state.ghostNodes.find((node) => node.id === ghostId)
      if (!ghostNode) {
        return { ghostNodes: state.ghostNodes }
      }

      const newNodeId = `node-${Date.now()}`
      const newNode: OMVNode = {
        id: newNodeId,
        type: ghostNode.data.suggestedType as Exclude<NodeType, 'GHOST'>,
        data: { text_content: ghostNode.data.text_content },
        position: ghostNode.position,
      }

      const nodes = [...state.nodes, newNode]
      const edges = addEdge(
        {
          source: ghostNode.data.parentId,
          target: newNodeId,
          sourceHandle: null,
          targetHandle: null,
        },
        state.edges
      )
      const ghostNodes = state.ghostNodes.filter((node) => node.id !== ghostId)

      schedulePersist(nodes, edges)

      return { nodes, edges, ghostNodes }
    })
  },
  dismissGhostNode: (ghostId) => {
    set((state) => ({
      ghostNodes: state.ghostNodes.filter((node) => node.id !== ghostId),
    }))
  },
  setIsGenerating: (value) => {
    set(() => ({ isGenerating: value }))
  },
  setAiError: (error) => {
    set(() => ({ aiError: error }))
  },
  setGlobalGoal: (goal) => {
    set(() => ({ globalGoal: goal }))
  },
  clearGhostNodes: () => {
    set(() => ({ ghostNodes: [] }))
  },
}))
