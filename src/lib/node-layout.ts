import type { XYPosition } from 'reactflow'

import type { OMVEdge, OMVNode } from '@/types/nodes'

const DEFAULT_NODE_HEIGHT = 140

type NodeWithMeasured = OMVNode & {
  measured?: {
    height?: number
  }
}

export const NODE_COLUMN_TOLERANCE = 96
export const NODE_VERTICAL_GAP = 24
export const NODE_HORIZONTAL_STEP = 380
export const NODE_SIBLING_VERTICAL_STEP = 220

const getNodeHeight = (node: OMVNode): number => {
  const measuredHeight = (node as NodeWithMeasured).measured?.height
  if (typeof measuredHeight === 'number') return measuredHeight
  if (typeof node.height === 'number') return node.height
  return DEFAULT_NODE_HEIGHT
}

export const createRightwardPosition = (source: XYPosition, step = 1): XYPosition => ({
  x: source.x + NODE_HORIZONTAL_STEP * step,
  y: source.y,
})

export const createRightwardSiblingPosition = (source: XYPosition, siblingIndex: number): XYPosition => {
  const anchor = createRightwardPosition(source)

  return {
    x: anchor.x,
    y: anchor.y + NODE_SIBLING_VERTICAL_STEP * siblingIndex,
  }
}

export const resolveVerticalCollisions = (nodes: OMVNode[], changedNodeIds: Set<string>): OMVNode[] => {
  if (changedNodeIds.size === 0) return nodes

  const nextNodes = nodes.map((node) => ({
    ...node,
    position: {
      x: node.position?.x ?? 0,
      y: node.position?.y ?? 0,
    },
  }))

  const nodesById = new Map(nextNodes.map((node) => [node.id, node]))
  const processedColumns = new Set<string>()
  let hasShift = false

  changedNodeIds.forEach((nodeId) => {
    const changedNode = nodesById.get(nodeId)
    if (!changedNode) return

    const columnKey = String(Math.round(changedNode.position.x / NODE_COLUMN_TOLERANCE))
    if (processedColumns.has(columnKey)) return

    processedColumns.add(columnKey)

    const columnNodes = nextNodes
      .filter((node) => Math.abs(node.position.x - changedNode.position.x) <= NODE_COLUMN_TOLERANCE)
      .sort((a, b) => a.position.y - b.position.y)

    let columnBottom = Number.NEGATIVE_INFINITY

    columnNodes.forEach((node) => {
      const currentY = node.position.y
      const minY = columnBottom === Number.NEGATIVE_INFINITY ? currentY : columnBottom + NODE_VERTICAL_GAP

      if (currentY < minY) {
        node.position = { ...node.position, y: minY }
        hasShift = true
      }

      columnBottom = node.position.y + getNodeHeight(node)
    })
  })

  return hasShift ? nextNodes : nodes
}

const FORMAT_START_X = 80
const FORMAT_START_Y = 80

export const formatNodesNeatly = (nodes: OMVNode[], edges: OMVEdge[]): OMVNode[] => {
  if (nodes.length <= 1) return nodes

  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const incomingCount = new Map<string, number>()
  const outgoing = new Map<string, string[]>()

  nodes.forEach((node) => {
    incomingCount.set(node.id, 0)
    outgoing.set(node.id, [])
  })

  edges.forEach((edge) => {
    if (!edge.source || !edge.target) return
    if (!nodeById.has(edge.source) || !nodeById.has(edge.target)) return

    incomingCount.set(edge.target, (incomingCount.get(edge.target) ?? 0) + 1)
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target])
  })

  const roots = nodes
    .filter((node) => (incomingCount.get(node.id) ?? 0) === 0)
    .sort((a, b) => {
      const ay = a.position?.y ?? 0
      const by = b.position?.y ?? 0
      if (ay !== by) return ay - by
      const ax = a.position?.x ?? 0
      const bx = b.position?.x ?? 0
      return ax - bx
    })

  const queue = roots.map((node) => node.id)
  const depthById = new Map<string, number>()

  queue.forEach((id) => {
    depthById.set(id, 0)
  })

  while (queue.length > 0) {
    const currentId = queue.shift()
    if (!currentId) continue

    const currentDepth = depthById.get(currentId) ?? 0
    const children = outgoing.get(currentId) ?? []

    children.forEach((childId) => {
      const nextDepth = currentDepth + 1
      const existingDepth = depthById.get(childId)
      if (existingDepth === undefined || existingDepth < nextDepth) {
        depthById.set(childId, nextDepth)
      }

      const remainingParents = (incomingCount.get(childId) ?? 1) - 1
      incomingCount.set(childId, remainingParents)

      if (remainingParents === 0) {
        queue.push(childId)
      }
    })
  }

  const minX = Math.min(...nodes.map((node) => node.position?.x ?? 0))
  nodes.forEach((node) => {
    if (depthById.has(node.id)) return
    const fallbackDepth = Math.max(
      0,
      Math.round(((node.position?.x ?? 0) - minX) / NODE_HORIZONTAL_STEP)
    )
    depthById.set(node.id, fallbackDepth)
  })

  const depthGroups = new Map<number, OMVNode[]>()
  nodes.forEach((node) => {
    const depth = depthById.get(node.id) ?? 0
    const group = depthGroups.get(depth) ?? []
    depthGroups.set(depth, [...group, node])
  })

  const sortedDepths = Array.from(depthGroups.keys()).sort((a, b) => a - b)
  const positionById = new Map<string, XYPosition>()

  sortedDepths.forEach((depth) => {
    const depthNodes = (depthGroups.get(depth) ?? []).sort((a, b) => {
      const ay = a.position?.y ?? 0
      const by = b.position?.y ?? 0
      if (ay !== by) return ay - by
      const ax = a.position?.x ?? 0
      const bx = b.position?.x ?? 0
      return ax - bx
    })

    let currentY = FORMAT_START_Y
    const x = FORMAT_START_X + depth * NODE_HORIZONTAL_STEP

    depthNodes.forEach((node) => {
      positionById.set(node.id, { x, y: currentY })
      currentY += getNodeHeight(node) + NODE_VERTICAL_GAP
    })
  })

  let hasPositionChange = false
  const formattedNodes = nodes.map((node) => {
    const nextPosition = positionById.get(node.id)
    if (!nextPosition) return node

    const currentX = node.position?.x ?? 0
    const currentY = node.position?.y ?? 0
    if (currentX === nextPosition.x && currentY === nextPosition.y) {
      return node
    }

    hasPositionChange = true
    return {
      ...node,
      position: nextPosition,
    }
  })

  return hasPositionChange ? formattedNodes : nodes
}
