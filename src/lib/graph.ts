import { getIncomers } from 'reactflow'

import type { OMVEdge, OMVNode } from '@/types/nodes'

const MAX_ANCESTRY_DEPTH = 50

const sortByXPosition = (nodes: OMVNode[]) =>
  [...nodes].sort((a, b) => (a.position?.x ?? 0) - (b.position?.x ?? 0))

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
