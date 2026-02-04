import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'

describe('StemFlowDB indexed tables', () => {
  beforeEach(async () => {
    await Promise.all([
      db.nodes.clear(),
      db.edges.clear(),
      db.projects.clear()
    ])
  })

  it('adds and reads a node record', async () => {
    const node = {
      id: 'node-1',
      type: 'OBSERVATION' as const,
      data: { text_content: 'node-content' },
      position: { x: 10, y: 20 },
      parentIds: ['parent-1']
    }

    await db.nodes.add(node)
    const saved = await db.nodes.get(node.id)

    expect(saved).toEqual(node)
  })

  it('adds and reads an edge record', async () => {
    const edge = {
      id: 'edge-1',
      source: 'node-1',
      target: 'node-2',
      type: 'default'
    }

    await db.edges.add(edge)
    const saved = await db.edges.get(edge.id)

    expect(saved).toEqual(edge)
  })

  it('adds and reads a project record', async () => {
    const project = {
      id: 'project-1',
      name: 'Canvas Test',
      created_at: new Date('2025-01-01T00:00:00Z')
    }

    await db.projects.add(project)
    const saved = await db.projects.get(project.id)

    expect(saved).toEqual(project)
  })
})
