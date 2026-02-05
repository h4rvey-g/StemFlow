import type { Edge, Node } from 'reactflow'

export type NodeType = 'OBSERVATION' | 'MECHANISM' | 'VALIDATION' | 'GHOST'

export interface NodeData {
  text_content: string
}

export interface GhostNodeData {
  text_content: string
  suggestedType: NodeType
  parentId: string
  ghostId: string
}

export type GhostNode = Node<GhostNodeData> & {
  type: 'GHOST'
}

export type OMVNode = Node<NodeData> & {
  type: NodeType
}

export type OMVEdge = Edge

export interface Project {
  id: string
  name: string
  created_at: Date
}
