import type { Edge, Node } from 'reactflow'

export type NodeType = 'OBSERVATION' | 'MECHANISM' | 'VALIDATION' | 'GHOST'

export type PlannerDirectionType = Exclude<NodeType, 'GHOST'>

export interface PlannerDirectionPreview {
  id: string
  summary_title: string
  suggestedType: PlannerDirectionType
  searchQuery: string
  sourceNodeId?: string
}

export type GenerationStatus = 'pending' | 'complete' | 'error'

export interface GenerationErrorPayload {
  message: string
  code?: string
  retryable?: boolean
  provider?: string
}

export interface Citation {
  index: number
  title: string
  url: string
  snippet?: string
  publishedDate?: string
}

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
  citations?: Citation[]
  generationStatus?: GenerationStatus
  generationError?: GenerationErrorPayload
  sourceGhostId?: string
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
  plannerDirection: PlannerDirectionPreview
  suggestedType: PlannerDirectionType
  parentId: string
  ghostId: string
  summary_title?: string
  text_content?: string
  citations?: Citation[]
  generationStatus?: GenerationStatus
  generationError?: GenerationErrorPayload
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
  updated_at: Date
}
