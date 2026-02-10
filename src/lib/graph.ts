import { getIncomers } from 'reactflow'
import type { Node as FlowNode } from 'reactflow'

import type {
  EpisodeGroupNodeData,
  ManualGroupNodeData,
  ManualNodeGroup,
  OMVEdge,
  OMVNode,
} from '@/types/nodes'
import { isConnectionSuggested } from '@/lib/connection-rules'

import type { Connection } from 'reactflow'

const MAX_ANCESTRY_DEPTH = 50
const DEFAULT_NODE_WIDTH = 320
const DEFAULT_NODE_HEIGHT = 170
const EPISODE_PADDING_X = 28
const EPISODE_PADDING_TOP = 92
const EPISODE_PADDING_BOTTOM = 28
const TEXT_WRAP_WIDTH_CHARS = 40
const TEXT_LINE_HEIGHT = 28
const NODE_HEIGHT_BASELINE = 96

export const DEFAULT_EPISODE_RATING = 3

type NodeWithSize = OMVNode & {
  measured?: {
    width?: number
    height?: number
  }
}

export type EpisodeBounds = {
  x: number
  y: number
  width: number
  height: number
}

export interface ResearchEpisode {
  id: string
  nodeIds: [string, string, string]
  bounds: EpisodeBounds
}

export interface EpisodeSuggestionContext {
  id: string
  rating: number
  mechanism: string
  validation: string
  observation: string
}

export type EpisodeGroupNode = FlowNode<EpisodeGroupNodeData> & {
  type: 'EPISODE_GROUP'
}

export type ManualGroupNode = FlowNode<ManualGroupNodeData> & {
  type: 'MANUAL_GROUP'
}

const sortByXPosition = (nodes: OMVNode[]) =>
  [...nodes].sort((a, b) => (a.position?.x ?? 0) - (b.position?.x ?? 0))

const getNodeWidth = (node: OMVNode): number => {
  const measuredWidth = (node as NodeWithSize).measured?.width
  if (typeof measuredWidth === 'number') return measuredWidth
  if (typeof node.width === 'number') return node.width
  return DEFAULT_NODE_WIDTH
}

const getNodeHeight = (node: OMVNode): number => {
  const measuredHeight = (node as NodeWithSize).measured?.height
  if (typeof measuredHeight === 'number') return measuredHeight
  if (typeof node.height === 'number') return node.height
  const text = node.data?.text_content ?? ''
  const lineCount = text
    .split(/\r?\n/)
    .reduce((total, line) => total + Math.max(1, Math.ceil(line.length / TEXT_WRAP_WIDTH_CHARS)), 0)
  const estimatedHeight = NODE_HEIGHT_BASELINE + lineCount * TEXT_LINE_HEIGHT
  if (Number.isFinite(estimatedHeight)) {
    return Math.max(DEFAULT_NODE_HEIGHT, estimatedHeight)
  }
  return DEFAULT_NODE_HEIGHT
}

const createEpisodeId = (mechanismId: string, validationId: string, observationId: string): string =>
  `episode-${mechanismId}-${validationId}-${observationId}`

const clampEpisodeRating = (value: number): number => Math.min(5, Math.max(1, Math.round(value)))

const readEpisodeRating = (episodeId: string, ratings: Record<string, number>): number => {
  const value = ratings[episodeId]
  return typeof value === 'number' ? clampEpisodeRating(value) : DEFAULT_EPISODE_RATING
}

const toPromptText = (node: OMVNode | undefined): string => {
  const text = node?.data?.text_content?.trim() ?? ''
  return text || 'No content provided.'
}

const createEpisodeBounds = (episodeNodes: OMVNode[]): EpisodeBounds => {
  const minX = Math.min(...episodeNodes.map((node) => node.position?.x ?? 0))
  const minY = Math.min(...episodeNodes.map((node) => node.position?.y ?? 0))
  const maxX = Math.max(...episodeNodes.map((node) => (node.position?.x ?? 0) + getNodeWidth(node)))
  const maxY = Math.max(...episodeNodes.map((node) => (node.position?.y ?? 0) + getNodeHeight(node)))

  const width = Math.max(240, maxX - minX + EPISODE_PADDING_X * 2)
  const height = Math.max(180, maxY - minY + EPISODE_PADDING_TOP + EPISODE_PADDING_BOTTOM)

  return {
    x: minX - EPISODE_PADDING_X,
    y: minY - EPISODE_PADDING_TOP,
    width,
    height,
  }
}

export const detectResearchEpisodes = (nodes: OMVNode[], edges: OMVEdge[]): ResearchEpisode[] => {
  if (nodes.length === 0 || edges.length === 0) return []

  const nodeMap = new Map(nodes.map((node) => [node.id, node]))
  const adjacency = new Map<string, Set<string>>()

  edges.forEach((edge) => {
    if (!edge.source || !edge.target) return

    const sourceNeighbors = adjacency.get(edge.source) ?? new Set<string>()
    sourceNeighbors.add(edge.target)
    adjacency.set(edge.source, sourceNeighbors)

    const targetNeighbors = adjacency.get(edge.target) ?? new Set<string>()
    targetNeighbors.add(edge.source)
    adjacency.set(edge.target, targetNeighbors)
  })

  const episodes: ResearchEpisode[] = []
  const seen = new Set<string>()

  nodes
    .filter((node) => node.type === 'MECHANISM')
    .forEach((mechanism) => {
      const validationIds = Array.from(adjacency.get(mechanism.id) ?? []).filter((id) => {
        const candidate = nodeMap.get(id)
        return candidate?.type === 'VALIDATION'
      })

      validationIds.forEach((validationId) => {
        const validation = nodeMap.get(validationId)
        if (!validation) return

        const observationIds = Array.from(adjacency.get(validationId) ?? []).filter((id) => {
          const candidate = nodeMap.get(id)
          return candidate?.type === 'OBSERVATION'
        })

        observationIds.forEach((observationId) => {
          const observation = nodeMap.get(observationId)
          if (!observation) return

          const episodeId = createEpisodeId(mechanism.id, validation.id, observation.id)
          if (seen.has(episodeId)) return

          seen.add(episodeId)
          episodes.push({
            id: episodeId,
            nodeIds: [mechanism.id, validation.id, observation.id],
            bounds: createEpisodeBounds([mechanism, validation, observation]),
          })
        })
      })
    })

  return episodes
}

export const buildEpisodeGroupNodes = (
  nodes: OMVNode[],
  edges: OMVEdge[],
  ratings: Record<string, number>,
  hiddenEpisodeIds: string[] = []
): EpisodeGroupNode[] =>
  detectResearchEpisodes(nodes, edges)
    .filter((episode) => !hiddenEpisodeIds.includes(episode.id))
    .map((episode) => ({
    id: `episode-group-${episode.id}`,
    type: 'EPISODE_GROUP',
    position: {
      x: episode.bounds.x,
      y: episode.bounds.y,
    },
    data: {
      episodeId: episode.id,
      rating: readEpisodeRating(episode.id, ratings),
      nodeIds: episode.nodeIds,
    },
    draggable: true,
    selectable: true,
    connectable: false,
    deletable: true,
    focusable: true,
    zIndex: -1,
    style: {
      width: episode.bounds.width,
      height: episode.bounds.height,
    },
    }))

export const buildEpisodeSuggestionContext = (
  nodes: OMVNode[],
  edges: OMVEdge[],
  ratings: Record<string, number>,
  hiddenEpisodeIds: string[] = []
): EpisodeSuggestionContext[] => {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]))

  return detectResearchEpisodes(nodes, edges)
    .filter((episode) => !hiddenEpisodeIds.includes(episode.id))
    .map((episode) => {
    const [mechanismId, validationId, observationId] = episode.nodeIds

    return {
      id: episode.id,
      rating: readEpisodeRating(episode.id, ratings),
      mechanism: toPromptText(nodeMap.get(mechanismId)),
      validation: toPromptText(nodeMap.get(validationId)),
      observation: toPromptText(nodeMap.get(observationId)),
    }
    })
}

export const buildManualGroupNodes = (
  nodes: OMVNode[],
  groups: ManualNodeGroup[]
): ManualGroupNode[] => {
  if (nodes.length === 0 || groups.length === 0) return []

  const nodeMap = new Map(nodes.map((node) => [node.id, node]))

  return groups
    .map((group): ManualGroupNode | null => {
      const members = group.nodeIds
        .map((nodeId) => nodeMap.get(nodeId))
        .filter((node): node is OMVNode => Boolean(node))

      if (members.length < 2) return null

      const bounds = createEpisodeBounds(members)

      return {
        id: `manual-group-${group.id}`,
        type: 'MANUAL_GROUP',
        position: {
          x: bounds.x,
          y: bounds.y,
        },
        data: {
          groupId: group.id,
          label: group.label,
          count: members.length,
          nodeIds: group.nodeIds,
        },
        draggable: true,
        selectable: true,
        connectable: false,
        deletable: true,
        focusable: true,
        zIndex: -1,
        style: {
          width: bounds.width,
          height: bounds.height,
        },
      }
    })
    .filter((group): group is ManualGroupNode => group !== null)
}

export const getNodeAncestry = (
  nodeId: string,
  nodes: OMVNode[],
  edges: OMVEdge[]
): OMVNode[] => {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]))
  const startNode = nodeMap.get(nodeId)

  if (!startNode) return []

  const visited = new Set<string>([nodeId])
  const ancestry: OMVNode[] = []
  let currentLayer: OMVNode[] = [startNode]
  let depth = 0

  while (currentLayer.length > 0 && depth < MAX_ANCESTRY_DEPTH) {
    const nextParents: OMVNode[] = []

    currentLayer.forEach((layerNode) => {
      const parents = sortByXPosition(getIncomers(layerNode, nodes, edges) as OMVNode[])
      parents.forEach((parent) => {
        if (visited.has(parent.id)) return
        visited.add(parent.id)
        ancestry.push(parent)
        nextParents.push(parent)
      })
    })

    currentLayer = nextParents
    depth += 1
  }

  ancestry.reverse()
  ancestry.push(startNode)

  return ancestry
}

export const formatAncestryForPrompt = (nodes: OMVNode[]): string =>
  nodes
    .map((node, index) => {
      const text = node.data?.text_content?.trim() ?? ''
      return `[${node.type}] Node #${index + 1}:\n${text}\n\n`
    })
    .join('')

export const getConnectionHighlight = (
  connection: Pick<Connection, 'source' | 'target'>,
  nodes: OMVNode[]
): 'suggested' | 'allowed' | null => {
  if (!connection.source || !connection.target) return null

  const sourceNode = nodes.find((node) => node.id === connection.source)
  const targetNode = nodes.find((node) => node.id === connection.target)

  if (!sourceNode || !targetNode) return null

  return isConnectionSuggested(sourceNode.type, targetNode.type) ? 'suggested' : 'allowed'
}
