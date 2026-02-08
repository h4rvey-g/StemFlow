import Dexie, { Table } from 'dexie'

import type { OMVNode, OMVEdge, Project } from '@/types/nodes'

export interface DbNode extends OMVNode {
  parentIds: string[]
}

export interface DbFile {
  id: string
  nodeId: string
  name: string
  mimeType: string
  size: number
  uploadedAt: number
  blob: Blob
}

export type NodeTable = Table<DbNode, string>
export type EdgeTable = Table<OMVEdge, string>
export type ProjectsTable = Table<Project, string>
export type FilesTable = Table<DbFile, string>

class StemFlowDB extends Dexie {
  nodes!: NodeTable
  edges!: EdgeTable
  projects!: ProjectsTable
  files!: FilesTable

  constructor() {
    super('StemFlowDB')
    this.version(1).stores({
      nodes: 'id, type, position, data, *parentIds',
      edges: 'id, source, target, type',
      projects: 'id, name, created_at'
    })

    this.version(2).stores({
      nodes: 'id, type, position, data, *parentIds',
      edges: 'id, source, target, type',
      projects: 'id, name, created_at',
      files: 'id, nodeId, mimeType, uploadedAt'
    })
  }
}

export const db = new StemFlowDB()
