import { describe, expect, it } from 'vitest'

import type { OMVEdge, OMVNode } from '@/types/nodes'
import {
  buildEpisodeGroupNodes,
  buildManualGroupNodes,
  buildEpisodeSuggestionContext,
  detectResearchEpisodes,
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

  it('detects mechanism-validation-observation episodes', () => {
    const nodes = [
      createNode('mechanism-1', 'MECHANISM', 40, 'Potential causal chain'),
      createNode('validation-1', 'VALIDATION', 250, 'Run comparison experiment'),
      createNode('observation-1', 'OBSERVATION', 480, 'Signal increases by 20%'),
      createNode('noise-1', 'OBSERVATION', 720, 'Unrelated observation'),
    ]
    const edges = [
      createEdge('edge-mv', 'mechanism-1', 'validation-1'),
      createEdge('edge-vo', 'validation-1', 'observation-1'),
      createEdge('edge-noise', 'mechanism-1', 'noise-1'),
    ]

    const episodes = detectResearchEpisodes(nodes, edges)

    expect(episodes).toHaveLength(1)
    expect(episodes[0]?.id).toBe('episode-mechanism-1-validation-1-observation-1')
    expect(episodes[0]?.nodeIds).toEqual(['mechanism-1', 'validation-1', 'observation-1'])
    expect(episodes[0]?.bounds.width).toBeGreaterThan(0)
    expect(episodes[0]?.bounds.height).toBeGreaterThan(0)
  })

  it('builds episode group nodes with default and saved ratings', () => {
    const nodes = [
      createNode('mechanism-1', 'MECHANISM', 20, 'Mechanism hypothesis'),
      createNode('validation-1', 'VALIDATION', 220, 'Validation plan'),
      createNode('observation-1', 'OBSERVATION', 420, 'Observed output'),
    ]
    const edges = [
      createEdge('edge-mv', 'mechanism-1', 'validation-1'),
      createEdge('edge-vo', 'validation-1', 'observation-1'),
    ]

    const withoutSavedRating = buildEpisodeGroupNodes(nodes, edges, {})
    const withSavedRating = buildEpisodeGroupNodes(nodes, edges, {
      'episode-mechanism-1-validation-1-observation-1': 5,
    })

    expect(withoutSavedRating).toHaveLength(1)
    expect(withoutSavedRating[0]?.data.rating).toBe(3)
    expect(withSavedRating[0]?.data.rating).toBe(5)
    expect(withSavedRating[0]?.type).toBe('EPISODE_GROUP')
  })

  it('skips hidden episode groups', () => {
    const nodes = [
      createNode('mechanism-1', 'MECHANISM', 20, 'Mechanism hypothesis'),
      createNode('validation-1', 'VALIDATION', 220, 'Validation plan'),
      createNode('observation-1', 'OBSERVATION', 420, 'Observed output'),
    ]
    const edges = [
      createEdge('edge-mv', 'mechanism-1', 'validation-1'),
      createEdge('edge-vo', 'validation-1', 'observation-1'),
    ]
    const hiddenEpisodeIds = ['episode-mechanism-1-validation-1-observation-1']

    const groups = buildEpisodeGroupNodes(nodes, edges, {}, hiddenEpisodeIds)

    expect(groups).toHaveLength(0)
  })

  it('builds episode suggestion context with fallback text', () => {
    const nodes = [
      createNode('mechanism-1', 'MECHANISM', 30, ''),
      createNode('validation-1', 'VALIDATION', 240, 'Validation strategy'),
      createNode('observation-1', 'OBSERVATION', 460, 'Measured outcome'),
    ]
    const edges = [
      createEdge('edge-mv', 'mechanism-1', 'validation-1'),
      createEdge('edge-vo', 'validation-1', 'observation-1'),
    ]

    const context = buildEpisodeSuggestionContext(nodes, edges, {
      'episode-mechanism-1-validation-1-observation-1': 1,
    })

    expect(context).toEqual([
      {
        id: 'episode-mechanism-1-validation-1-observation-1',
        rating: 1,
        mechanism: 'No content provided.',
        validation: 'Validation strategy',
        observation: 'Measured outcome',
      },
    ])
  })

  it('skips hidden episodes in suggestion context', () => {
    const nodes = [
      createNode('mechanism-1', 'MECHANISM', 30, 'Mechanism text'),
      createNode('validation-1', 'VALIDATION', 240, 'Validation text'),
      createNode('observation-1', 'OBSERVATION', 460, 'Observation text'),
    ]
    const edges = [
      createEdge('edge-mv', 'mechanism-1', 'validation-1'),
      createEdge('edge-vo', 'validation-1', 'observation-1'),
    ]
    const hiddenEpisodeIds = ['episode-mechanism-1-validation-1-observation-1']

    const context = buildEpisodeSuggestionContext(nodes, edges, {}, hiddenEpisodeIds)

    expect(context).toEqual([])
  })

  it('expands episode bounds for long unmeasured node content', () => {
    const longValidation =
      'Validation details '.repeat(80)
    const longObservation =
      'Observation details '.repeat(70)

    const nodes = [
      createNode('mechanism-1', 'MECHANISM', 40, 'Mechanism hypothesis'),
      createNode('validation-1', 'VALIDATION', 280, longValidation),
      createNode('observation-1', 'OBSERVATION', 520, longObservation),
    ]
    const edges = [
      createEdge('edge-mv', 'mechanism-1', 'validation-1'),
      createEdge('edge-vo', 'validation-1', 'observation-1'),
    ]

    const episodes = detectResearchEpisodes(nodes, edges)

    expect(episodes).toHaveLength(1)
    expect(episodes[0]?.bounds.height).toBeGreaterThan(500)
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
