import { describe, expect, it } from 'vitest'

import type { OMVEdge, OMVNode } from '@/types/nodes'
import {
  buildNodeSuggestionContext,
  buildManualGroupNodes,
  formatAncestryForPrompt,
  getNodeAncestry,
} from '@/lib/graph'

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

  it('builds suggestion context from graded nodes only', () => {
    const nodes = [
      createNode('mechanism-1', 'MECHANISM', 30, 'Mechanism text'),
      createNode('validation-1', 'VALIDATION', 240, 'Validation text'),
      createNode('observation-1', 'OBSERVATION', 460, 'Observation text'),
    ]
    nodes[0].data.grade = 5
    nodes[1].data.grade = 2

    const context = buildNodeSuggestionContext(nodes)

    expect(context).toEqual([
      {
        id: 'mechanism-1',
        type: 'MECHANISM',
        grade: 5,
        content: 'Mechanism text',
      },
      {
        id: 'validation-1',
        type: 'VALIDATION',
        grade: 2,
        content: 'Validation text',
      },
    ])
  })

  it('normalizes invalid grades in suggestion context', () => {
    const nodes = [
      createNode('node-1', 'OBSERVATION', 10, 'Content A'),
      createNode('node-2', 'MECHANISM', 20, 'Content B'),
      createNode('node-3', 'VALIDATION', 30, ''),
    ]

    nodes[0].data.grade = 10
    nodes[1].data.grade = 0
    nodes[2].data.grade = 3

    const context = buildNodeSuggestionContext(nodes)

    expect(context).toEqual([
      {
        id: 'node-1',
        type: 'OBSERVATION',
        grade: 5,
        content: 'Content A',
      },
      {
        id: 'node-2',
        type: 'MECHANISM',
        grade: 1,
        content: 'Content B',
      },
      {
        id: 'node-3',
        type: 'VALIDATION',
        grade: 3,
        content: 'No content provided.',
      },
    ])
  })

  it('builds manual group nodes for selected node groups', () => {
    const nodes = [
      createNode('mechanism-1', 'MECHANISM', 20, 'Mechanism hypothesis'),
      createNode('validation-1', 'VALIDATION', 220, 'Validation plan'),
      createNode('observation-1', 'OBSERVATION', 440, 'Observed output'),
    ]

    const groups = [
      {
        id: 'manual-1',
        label: 'Group 1',
        nodeIds: ['mechanism-1', 'validation-1', 'observation-1'],
      },
    ]

    const manualGroups = buildManualGroupNodes(nodes, groups)

    expect(manualGroups).toHaveLength(1)
    expect(manualGroups[0]?.type).toBe('MANUAL_GROUP')
    expect(manualGroups[0]?.data.label).toBe('Group 1')
    expect(manualGroups[0]?.data.count).toBe(3)
  })
})
