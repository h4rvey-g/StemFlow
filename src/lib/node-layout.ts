import type { XYPosition } from 'reactflow'

import type { OMVNode } from '@/types/nodes'

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
