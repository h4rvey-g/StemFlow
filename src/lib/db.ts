import Dexie, { Table } from 'dexie'

import type { OMVNode, OMVEdge, Project } from '@/types/nodes'

export interface DbNode extends OMVNode {
  parentIds: string[]
}

export type NodeTable = Table<DbNode, string>
export type EdgeTable = Table<OMVEdge, string>
export type ProjectsTable = Table<Project, string>

class StemFlowDB extends Dexie {
  nodes!: NodeTable
  edges!: EdgeTable
  projects!: ProjectsTable

  constructor() {
    super('StemFlowDB')
    this.version(1).stores({
      nodes: 'id, type, position, data, *parentIds',
      edges: 'id, source, target, type',
      projects: 'id, name, created_at'
    })
  }
}

export const db = new StemFlowDB()
