import { create } from 'zustand'
import { addEdge, applyEdgeChanges, applyNodeChanges } from 'reactflow'
import type { Connection, EdgeChange, NodeChange } from 'reactflow'

import type { DbNode } from '@/lib/db'
import { db } from '@/lib/db'
import { deleteAttachmentsForNode } from '@/lib/file-storage'
import { formatNodesNeatly, resolveVerticalCollisions } from '@/lib/node-layout'
import type {
  GhostEdge,
  GhostNode,
  ManualNodeGroup,
  NodeData,
  NodeType,
  OMVEdge,
  OMVNode,
} from '@/types/nodes'

export type { NodeType, OMVNode } from '@/types/nodes'

const hasNodeChangeId = (change: NodeChange): change is NodeChange & { id: string } =>
  'id' in change && typeof change.id === 'string'

const isTrackedNodeChange = (change: NodeChange): change is NodeChange & { id: string } =>
  hasNodeChangeId(change) && change.type === 'dimensions'

let persistDelayMs = 300
let persistTimeout: ReturnType<typeof setTimeout> | null = null

const GLOBAL_GOAL_STORAGE = 'stemflow:globalGoal'
const MANUAL_GROUPS_STORAGE = 'stemflow:manualGroups'
const SOURCE_HANDLE_IDS = ['s-middle', 's-top', 's-bottom'] as const
const TARGET_HANDLE_IDS = ['t-middle', 't-top', 't-bottom'] as const

const saveManualGroups = (groups: ManualNodeGroup[]) => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(MANUAL_GROUPS_STORAGE, JSON.stringify(groups))
  } catch {
    // ignore
  }
}

const loadManualGroups = (): ManualNodeGroup[] => {
  if (typeof window === 'undefined') return []

  try {
    const raw = window.localStorage.getItem(MANUAL_GROUPS_STORAGE)
    if (!raw) return []

    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    return parsed
      .map((entry): ManualNodeGroup | null => {
        if (!entry || typeof entry !== 'object') return null
        const id = Reflect.get(entry, 'id')
        const label = Reflect.get(entry, 'label')
        const nodeIds = Reflect.get(entry, 'nodeIds')

        if (typeof id !== 'string' || typeof label !== 'string' || !Array.isArray(nodeIds)) {
          return null
        }

        const cleanedNodeIds = nodeIds.filter((value): value is string => typeof value === 'string')
        if (cleanedNodeIds.length < 2) return null

        return {
          id,
          label,
          nodeIds: Array.from(new Set(cleanedNodeIds)),
        }
      })
      .filter((group): group is ManualNodeGroup => group !== null)
  } catch {
    return []
  }
}

type HandleAssignable = {
  source?: string | null
  target?: string | null
  sourceHandle?: string | null
  targetHandle?: string | null
}

const loadGlobalGoal = (): string => {
  if (typeof window === 'undefined') return ''
  try {
    return window.localStorage.getItem(GLOBAL_GOAL_STORAGE) ?? ''
  } catch {
    return ''
  }
}

const pickLeastUsedHandle = (
  edges: OMVEdge[],
  nodeId: string,
  side: 'source' | 'target'
): string => {
  const handleIds = side === 'source' ? SOURCE_HANDLE_IDS : TARGET_HANDLE_IDS
  const counts = new Map<string, number>(handleIds.map((handleId) => [handleId, 0]))

  for (const edge of edges) {
    if (side === 'source' && edge.source === nodeId) {
      const handleId = edge.sourceHandle ?? SOURCE_HANDLE_IDS[0]
      if (counts.has(handleId)) {
        counts.set(handleId, (counts.get(handleId) ?? 0) + 1)
      }
      continue
    }

    if (side === 'target' && edge.target === nodeId) {
      const handleId = edge.targetHandle ?? TARGET_HANDLE_IDS[0]
      if (counts.has(handleId)) {
        counts.set(handleId, (counts.get(handleId) ?? 0) + 1)
      }
    }
  }

  return handleIds.reduce((best, candidate) => {
    if ((counts.get(candidate) ?? 0) < (counts.get(best) ?? 0)) {
      return candidate
    }
    return best
  }, handleIds[0])
}

const withDistributedHandles = <T extends HandleAssignable>(
  edgeLike: T,
  edges: OMVEdge[],
  nodes: OMVNode[]
): T => {
  if (!edgeLike.source || !edgeLike.target) return edgeLike

  const next = { ...edgeLike }
  const sourceId = next.source
  const targetId = next.target

  if (typeof sourceId !== 'string' || typeof targetId !== 'string') {
    return edgeLike
  }

  const sourceIsResearchNode = nodes.some((node) => node.id === sourceId)
  const targetIsResearchNode = nodes.some((node) => node.id === targetId)

  if (!next.sourceHandle && sourceIsResearchNode) {
    next.sourceHandle = pickLeastUsedHandle(edges, sourceId, 'source')
  }

  if (!next.targetHandle && targetIsResearchNode) {
    next.targetHandle = pickLeastUsedHandle(edges, targetId, 'target')
  }

  return next
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
  manualGroups: ManualNodeGroup[]
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
  setNodeGrade: (nodeId: string, grade: number) => void
  createManualGroup: (nodeIds: string[]) => void
  deleteManualGroup: (groupId: string) => void
  renameManualGroup: (groupId: string, newLabel: string) => void
  clearGhostNodes: () => void
  formatCanvas: () => void
}

export const useStore = create<StoreState>((set) => ({
  nodes: [],
  edges: [],
  manualGroups: loadManualGroups(),
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
      const edges = state.edges.filter((edge) => edge.source !== id && edge.target !== id)
      schedulePersist(nodes, edges)
      void deleteAttachmentsForNode(id).catch((error: unknown) => {
        console.error('Failed to delete node attachments:', error)
      })
      return { nodes, edges }
    })
  },
  addEdge: (edge) => {
    set((state) => {
      const distributed = withDistributedHandles(edge, state.edges, state.nodes)
      const edges = addEdge(distributed, state.edges)
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

      const changedNodeIds = new Set(
        nonGhostChanges
          .filter(isTrackedNodeChange)
          .map((change) => change.id)
      )

      const nextNodes = applyNodeChanges(nonGhostChanges, state.nodes) as OMVNode[]
      const nodes = resolveVerticalCollisions(nextNodes, changedNodeIds)
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
      const distributed = withDistributedHandles(connection, state.edges, state.nodes)
      const edges = addEdge(distributed, state.edges)
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
      const distributed = withDistributedHandles(
        {
          source: ghostNode.data.parentId,
          target: newNodeId,
          sourceHandle: null,
          targetHandle: null,
        },
        state.edges,
        nodes
      )
      const edges = addEdge(
        {
          source: distributed.source,
          target: distributed.target,
          sourceHandle: distributed.sourceHandle,
          targetHandle: distributed.targetHandle,
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
  setNodeGrade: (nodeId, grade) => {
    const normalizedGrade = Math.min(5, Math.max(1, Math.round(grade)))
    set((state) => {
      const nodes = state.nodes.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              data: {
                ...node.data,
                grade: normalizedGrade,
              },
            }
          : node
      )

      schedulePersist(nodes, state.edges)
      return { nodes }
    })
  },
  createManualGroup: (nodeIds) => {
    const uniqueNodeIds = Array.from(new Set(nodeIds))
    if (uniqueNodeIds.length < 2) return

    set((state) => {
      const existingIds = new Set(state.nodes.map((node) => node.id))
      const filteredNodeIds = uniqueNodeIds.filter((nodeId) => existingIds.has(nodeId))
      if (filteredNodeIds.length < 2) {
        return state
      }

      const sortedCandidate = [...filteredNodeIds].sort()
      const hasEquivalentGroup = state.manualGroups.some((group) => {
        if (group.nodeIds.length !== sortedCandidate.length) return false
        const sortedExisting = [...group.nodeIds].sort()
        return sortedExisting.every((value, index) => value === sortedCandidate[index])
      })

      if (hasEquivalentGroup) {
        return state
      }

      const manualGroups = [
        ...state.manualGroups,
        {
          id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          label: `Group ${state.manualGroups.length + 1}`,
          nodeIds: filteredNodeIds,
        },
      ]

      saveManualGroups(manualGroups)
      return { manualGroups }
    })
  },
  deleteManualGroup: (groupId) => {
    set((state) => {
      const manualGroups = state.manualGroups.filter((g) => g.id !== groupId)
      saveManualGroups(manualGroups)
      return { manualGroups }
    })
  },
  renameManualGroup: (groupId, newLabel) => {
    set((state) => {
      const manualGroups = state.manualGroups.map((g) =>
        g.id === groupId ? { ...g, label: newLabel } : g
      )
      saveManualGroups(manualGroups)
      return { manualGroups }
    })
  },
  clearGhostNodes: () => {
    set(() => ({ ghostNodes: [], ghostEdges: [] }))
  },
  formatCanvas: () => {
    set((state) => {
      const nodes = formatNodesNeatly(state.nodes, state.edges)
      if (nodes === state.nodes) return state

      schedulePersist(nodes, state.edges)
      return { nodes }
    })
  },
}))
