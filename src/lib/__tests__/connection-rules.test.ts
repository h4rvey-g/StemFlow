import { describe, expect, it } from 'vitest'

import { getConnectionHighlight } from '@/lib/graph'
import { getSuggestedTargetTypes, isConnectionSuggested } from '@/lib/connection-rules'

describe('connection rules', () => {
  it('suggests Observation -> Mechanism', () => {
    expect(getSuggestedTargetTypes('OBSERVATION')).toEqual(['MECHANISM'])
    expect(isConnectionSuggested('OBSERVATION', 'MECHANISM')).toBe(true)
  })

  it('suggests Mechanism -> Validation', () => {
    expect(getSuggestedTargetTypes('MECHANISM')).toEqual(['VALIDATION'])
    expect(isConnectionSuggested('MECHANISM', 'VALIDATION')).toBe(true)
  })

  it('suggests Validation -> Observation (cycle)', () => {
    expect(getSuggestedTargetTypes('VALIDATION')).toEqual(['OBSERVATION'])
    expect(isConnectionSuggested('VALIDATION', 'OBSERVATION')).toBe(true)
  })

  it('allows non-suggested types to be non-suggested', () => {
    expect(isConnectionSuggested('MECHANISM', 'OBSERVATION')).toBe(false)
    expect(isConnectionSuggested('OBSERVATION', 'VALIDATION')).toBe(false)
  })

  it('getConnectionHighlight returns suggested for OMV path', () => {
    const nodes = [
      { id: 'o1', type: 'OBSERVATION', data: { text_content: 'o' }, position: { x: 0, y: 0 } },
      { id: 'm1', type: 'MECHANISM', data: { text_content: 'm' }, position: { x: 0, y: 0 } },
    ]

    expect(getConnectionHighlight({ source: 'o1', target: 'm1' }, nodes as any)).toBe('suggested')
  })

  it('getConnectionHighlight returns allowed for other connections', () => {
    const nodes = [
      { id: 'm1', type: 'MECHANISM', data: { text_content: 'm' }, position: { x: 0, y: 0 } },
      { id: 'o1', type: 'OBSERVATION', data: { text_content: 'o' }, position: { x: 0, y: 0 } },
    ]

    expect(getConnectionHighlight({ source: 'm1', target: 'o1' }, nodes as any)).toBe('allowed')
  })

  it('getConnectionHighlight returns null when nodes missing', () => {
    const nodes = [{ id: 'o1', type: 'OBSERVATION', data: { text_content: 'o' }, position: { x: 0, y: 0 } }]
    expect(getConnectionHighlight({ source: 'o1', target: 'missing' }, nodes as any)).toBe(null)
  })
})
