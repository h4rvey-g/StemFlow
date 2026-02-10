import type { Edge, Node } from 'reactflow'

export type NodeType = 'OBSERVATION' | 'MECHANISM' | 'VALIDATION' | 'GHOST'

export interface FileMetadata {
  id: string
  name: string
  mimeType: string
  size: number
  uploadedAt: number
}

export interface NodeFileAttachment extends FileMetadata {
  processingStatus: 'processing' | 'ready' | 'error'
  processingError: string | null
  textExcerpt: string | null
  imageDescription: string | null
}

export interface NodeData {
  text_content: string
  summary_title?: string
  grade?: number | null
  attachments?: NodeFileAttachment[]
  // Legacy fields kept for backward compatibility with older persisted data.
  fileMetadata?: FileMetadata | null
  fileProcessingStatus?: 'processing' | 'ready' | 'error' | null
  fileProcessingError?: string | null
  fileTextExcerpt?: string | null
  imageDescription?: string | null
}

export interface ManualGroupNodeData {
  groupId: string
  label: string
  count: number
  nodeIds: string[]
}

export interface ManualNodeGroup {
  id: string
  nodeIds: string[]
  label: string
}

export interface GhostNodeData {
  text_content: string
  summary_title?: string
  suggestedType: NodeType
  parentId: string
  ghostId: string
}

export type GhostNode = Node<GhostNodeData> & {
  type: 'GHOST'
}

export type OMVNode = Node<NodeData> & {
  type: NodeType
  parentIds?: string[]
}

export type OMVEdge = Edge

export type GhostEdge = Edge & {
  id: `ghost-edge-${string}`
  data?: {
    ghost?: true
  }
}

export interface Project {
  id: string
  name: string
  created_at: Date
}
