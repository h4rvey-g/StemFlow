import Dexie, { Table } from 'dexie'

import type { OMVNode, OMVEdge, Project } from '@/types/nodes'

export interface DbNode extends OMVNode {
  parentIds: string[]
  projectId: string
}

export type DbEdge = OMVEdge & {
  projectId: string
}

export interface DbFile {
  id: string
  nodeId: string
  projectId: string
  name: string
  mimeType: string
  size: number
  uploadedAt: number
  blob: Blob
}

export type NodeTable = Table<DbNode, string>
export type EdgeTable = Table<DbEdge, string>
export type ProjectsTable = Table<Project, string>
export type FilesTable = Table<DbFile, string>

export const DEFAULT_PROJECT_ID = 'default-project'

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

    this.version(3)
      .stores({
        nodes: 'id, type, projectId, *parentIds',
        edges: 'id, source, target, projectId',
        projects: 'id, name, created_at, updated_at',
        files: 'id, nodeId, projectId, mimeType, uploadedAt'
      })
      .upgrade(async (tx) => {
        const assignProject = (record: Record<string, unknown>) => {
          record.projectId = DEFAULT_PROJECT_ID
        }

        await tx.table('nodes').toCollection().modify(assignProject)
        await tx.table('edges').toCollection().modify(assignProject)
        await tx.table('files').toCollection().modify(assignProject)

        const nodeCount = await tx.table('nodes').count()
        if (nodeCount > 0) {
          const now = new Date()
          await tx.table('projects').put({
            id: DEFAULT_PROJECT_ID,
            name: 'My Research',
            created_at: now,
            updated_at: now
          })
        }
      })
  }
}

export const db = new StemFlowDB()
