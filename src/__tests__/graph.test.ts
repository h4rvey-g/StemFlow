import { describe, expect, it } from 'vitest'

import type { OMVEdge, OMVNode } from '@/types/nodes'
import { formatAncestryForPrompt, getNodeAncestry } from '@/lib/graph'

const createNode = (id: string, type: OMVNode['type'], x: number, text: string): OMVNode => ({
  id,
  type,
  data: { text_content: text },
  position: { x, y: 0 },
})

const createEdge = (id: string, source: string, target: string): OMVEdge => ({
  id,
  source,
  target,
})

describe('graph utilities', () => {
  it('returns ancestors in BFS order sorted by x-position', () => {
    const nodes = [
      createNode('parent-left', 'OBSERVATION', 0, 'left'),
      createNode('parent-right', 'MECHANISM', 200, 'right'),
      createNode('middle', 'VALIDATION', 100, 'middle'),
      createNode('root', 'OBSERVATION', 50, 'root'),
    ]
    const edges = [
      createEdge('edge-left', 'parent-left', 'root'),
      createEdge('edge-right', 'parent-right', 'root'),
      createEdge('edge-middle', 'middle', 'parent-right'),
    ]

    const ancestry = getNodeAncestry('root', nodes, edges)
    const ancestryIds = ancestry.map((node) => node.id)

    expect(ancestryIds).toEqual(['middle', 'parent-right', 'parent-left', 'root'])
  })

  it('stops when cycle is detected', () => {
    const nodes = [
      createNode('node-a', 'OBSERVATION', 0, 'a'),
      createNode('node-b', 'MECHANISM', 10, 'b'),
    ]
    const edges = [
      createEdge('edge-ab', 'node-a', 'node-b'),
      createEdge('edge-ba', 'node-b', 'node-a'),
    ]

    const ancestry = getNodeAncestry('node-a', nodes, edges)
    const ancestryIds = ancestry.map((node) => node.id)

    expect(ancestryIds).toEqual(['node-b', 'node-a'])
  })

  it('formats ancestry for prompt output', () => {
    const nodes = [
      createNode('node-a', 'OBSERVATION', 0, 'Observation text'),
      createNode('node-b', 'MECHANISM', 10, 'Mechanism text'),
    ]

    const formatted = formatAncestryForPrompt(nodes)

    expect(formatted).toBe(
      '[OBSERVATION] Node #1:\nObservation text\n\n' +
        '[MECHANISM] Node #2:\nMechanism text\n\n'
    )
  })
})
