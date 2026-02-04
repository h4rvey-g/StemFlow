import type { Edge, Node } from 'reactflow'

export type NodeType = 'OBSERVATION' | 'MECHANISM' | 'VALIDATION'

export interface NodeData {
  text_content: string
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
