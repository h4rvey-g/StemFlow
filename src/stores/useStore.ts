import { create } from 'zustand'
import { addEdge, applyEdgeChanges, applyNodeChanges } from 'reactflow'
import type { Connection, EdgeChange, NodeChange } from 'reactflow'

import type { DbNode } from '@/lib/db'
import { db } from '@/lib/db'
import type { GhostEdge, GhostNode, GhostNodeData, NodeData, NodeType, OMVEdge, OMVNode } from '@/types/nodes'

export type { NodeType, OMVNode } from '@/types/nodes'

let persistDelayMs = 300
let persistTimeout: ReturnType<typeof setTimeout> | null = null

const GLOBAL_GOAL_STORAGE = 'stemflow:globalGoal'

const loadGlobalGoal = (): string => {
  if (typeof window === 'undefined') return ''
  try {
    return window.localStorage.getItem(GLOBAL_GOAL_STORAGE) ?? ''
  } catch {
    return ''
  }
}

const schedulePersist = (nodes: OMVNode[], edges: OMVEdge[]) => {
  const parentMap = new Map<string, Set<string>>()
  edges.forEach((edge) => {
    if (!edge.source || !edge.target) return
    const set = parentMap.get(edge.target) ?? new Set<string>()
    set.add(edge.source)
    parentMap.set(edge.target, set)
  })

  const dbNodes: DbNode[] = nodes.map((node) => ({
    ...node,
    parentIds: Array.from(parentMap.get(node.id) ?? []),
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
  ghostEdges: GhostEdge[]
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
  setGhostSuggestions: (nodes: GhostNode[], edges: GhostEdge[]) => void
  acceptGhostNode: (ghostId: string) => void
  dismissGhostNode: (ghostId: string) => void
  dismissAllGhostNodes: () => void
  setIsGenerating: (value: boolean) => void
  setAiError: (error: string | null) => void
  setGlobalGoal: (goal: string) => void
  clearGhostNodes: () => void
}

export const useStore = create<StoreState>((set) => ({
  nodes: [],
  edges: [],
  ghostNodes: [],
  ghostEdges: [],
  isGenerating: false,
  aiError: null,
  globalGoal: loadGlobalGoal(),
  isLoading: false,
  loadFromDb: async () => {
    set({ isLoading: true })
    const [dbNodes, edges] = await Promise.all([
      db.nodes.toArray(),
      db.edges.toArray(),
    ])
    set({ nodes: dbNodes, edges, isLoading: false })
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
      const ghostChanges = changes.filter(
        (change) => 'id' in change && typeof change.id === 'string' && change.id.startsWith('ghost-edge-')
      )
      const nonGhostChanges = changes.filter(
        (change) => !('id' in change && typeof change.id === 'string' && change.id.startsWith('ghost-edge-'))
      )

      const edges = applyEdgeChanges(nonGhostChanges, state.edges) as OMVEdge[]
      const ghostEdges = applyEdgeChanges(ghostChanges, state.ghostEdges) as GhostEdge[]
      schedulePersist(state.nodes, edges)
      return { edges, ghostEdges }
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
    set(() => {
      return { ghostNodes }
    })
  },
  setGhostSuggestions: (ghostNodes, ghostEdges) => {
    set(() => ({ ghostNodes, ghostEdges }))
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
      const ghostEdges = state.ghostEdges.filter((edge) => edge.target !== ghostId)

      schedulePersist(nodes, edges)

      return { nodes, edges, ghostNodes, ghostEdges }
    })
  },
  dismissGhostNode: (ghostId) => {
    set((state) => ({
      ghostNodes: state.ghostNodes.filter((node) => node.id !== ghostId),
      ghostEdges: state.ghostEdges.filter((edge) => edge.target !== ghostId),
    }))
  },
  dismissAllGhostNodes: () => {
    set(() => ({ ghostNodes: [], ghostEdges: [] }))
  },
  setIsGenerating: (value) => {
    set(() => ({ isGenerating: value }))
  },
  setAiError: (error) => {
    set(() => ({ aiError: error }))
  },
  setGlobalGoal: (goal) => {
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(GLOBAL_GOAL_STORAGE, goal)
      } catch {
        // ignore
      }
    }
    set(() => ({ globalGoal: goal }))
  },
  clearGhostNodes: () => {
    set(() => ({ ghostNodes: [], ghostEdges: [] }))
  },
}))
