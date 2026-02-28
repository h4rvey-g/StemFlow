import Dexie, { Table } from 'dexie'

import { generateId } from '@/lib/uuid'
import type { OMVNode, OMVEdge, Project } from '@/types/nodes'
import type {
  ChatThread,
  ChatThreadV2,
  ChatTurn,
  AssistantVariant,
  NodeActiveThread
} from '@/types/chat'

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
export type ChatThreadsTable = Table<ChatThread, string>
export type ChatThreadsV2Table = Table<ChatThreadV2, string>
export type ChatTurnsTable = Table<ChatTurn, string>
export type AssistantVariantsTable = Table<AssistantVariant, string>
export type NodeActiveThreadTable = Table<NodeActiveThread, string>

export const DEFAULT_PROJECT_ID = 'default-project'

export class StemFlowDB extends Dexie {
  nodes!: NodeTable
  edges!: EdgeTable
  projects!: ProjectsTable
  files!: FilesTable
  /** Legacy v1 store — read-only after v5 migration, never deleted */
  chatThreads!: ChatThreadsTable
  chatThreadsV2!: ChatThreadsV2Table
  chatTurns!: ChatTurnsTable
  chatVariants!: AssistantVariantsTable
  nodeActiveThread!: NodeActiveThreadTable

  constructor(name = 'StemFlowDB') {
    super(name)
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
        files: 'id, nodeId, projectId, mimeType, uploadedAt',
        chatThreads: 'nodeId, createdAt'
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

    this.version(4).stores({
      nodes: 'id, type, projectId, *parentIds',
      edges: 'id, source, target, projectId',
      projects: 'id, name, created_at, updated_at',
      files: 'id, nodeId, projectId, mimeType, uploadedAt',
      chatThreads: 'nodeId, createdAt'
    })

    this.version(5)
      .stores({
        nodes: 'id, type, projectId, *parentIds',
        edges: 'id, source, target, projectId',
        projects: 'id, name, created_at, updated_at',
        files: 'id, nodeId, projectId, mimeType, uploadedAt',
        // Legacy v1 store — kept read-only, never deleted
        chatThreads: 'nodeId, createdAt',
        // V2 multi-thread stores
        chatThreadsV2: 'id, nodeId, updatedAt',
        chatTurns: 'id, threadId, seq',
        chatVariants: 'id, turnId, ordinal',
        nodeActiveThread: 'nodeId'
      })
      .upgrade(async (tx) => {
        // Migrate legacy chatThreads → v2 tables (idempotent)
        const legacyThreads: ChatThread[] = await tx.table('chatThreads').toArray()

        for (const legacy of legacyThreads) {
          // Idempotency: skip if a v2 thread already exists for this nodeId
          const existing = await tx
            .table('chatThreadsV2')
            .where('nodeId')
            .equals(legacy.nodeId)
            .first()
          if (existing) continue

          const threadId = generateId()
          const now = Date.now()

          const thread: ChatThreadV2 = {
            id: threadId,
            nodeId: legacy.nodeId,
            title: 'Migrated Chat',
            createdAt: legacy.createdAt ?? now,
            updatedAt: legacy.updatedAt ?? now
          }
          await tx.table('chatThreadsV2').put(thread)

          // Set this as the active thread for the node
          await tx.table('nodeActiveThread').put({
            nodeId: legacy.nodeId,
            threadId
          })

          // Convert flat messages into turns + variants
          const messages = legacy.messages ?? []
          let seq = 0
          let i = 0
          while (i < messages.length) {
            const msg = messages[i]
            if (msg.role === 'user') {
              const turnId = generateId()
              const turnNow = msg.timestamp ?? now

              // Look ahead for an assistant reply
              const nextMsg = messages[i + 1]
              const hasAssistant = nextMsg && nextMsg.role === 'assistant'

              const turn: ChatTurn = {
                id: turnId,
                threadId,
                seq,
                userText: msg.content,
                userCreatedAt: turnNow,
                selectedVariantOrdinal: hasAssistant ? 0 : null
              }
              await tx.table('chatTurns').put(turn)

              if (hasAssistant) {
                const variantNow = nextMsg.timestamp ?? now
                const variant: AssistantVariant = {
                  id: generateId(),
                  turnId,
                  ordinal: 0,
                  status: 'complete',
                  mode: nextMsg.mode ?? 'answer',
                  contentText: nextMsg.content,
                  createdAt: variantNow,
                  updatedAt: variantNow
                }
                await tx.table('chatVariants').put(variant)
                i += 2
              } else {
                i += 1
              }
              seq += 1
            } else {
              // Standalone assistant message without preceding user turn — skip
              i += 1
            }
          }
        }
      })
  }
}

export const db = new StemFlowDB()
