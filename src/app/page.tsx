'use client'

import React, { useCallback, useRef, useEffect } from 'react'
import ReactFlow, {
  ReactFlowProvider,
  useReactFlow,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { useShallow } from 'zustand/shallow'

import { useStore, type StoreState } from '@/stores/useStore'
import type { OMVNode, NodeType } from '@/stores/useStore'
import { Sidebar } from '@/components/Sidebar'
import { ObservationNode } from '@/components/nodes/ObservationNode'
import { MechanismNode } from '@/components/nodes/MechanismNode'
import { ValidationNode } from '@/components/nodes/ValidationNode'

const nodeTypes = {
  OBSERVATION: ObservationNode,
  MECHANISM: MechanismNode,
  VALIDATION: ValidationNode,
}

type CanvasState = Pick<
  StoreState,
  | 'nodes'
  | 'edges'
  | 'onNodesChange'
  | 'onEdgesChange'
  | 'onConnect'
  | 'addNode'
  | 'loadFromDb'
>

const selectCanvasState = (state: StoreState): CanvasState => ({
  nodes: state.nodes,
  edges: state.edges,
  onNodesChange: state.onNodesChange,
  onEdgesChange: state.onEdgesChange,
  onConnect: state.onConnect,
  addNode: state.addNode,
  loadFromDb: state.loadFromDb,
})

function Canvas() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const hasLoadedRef = useRef(false)
  const { screenToFlowPosition } = useReactFlow()
  const selector = useShallow(selectCanvasState)

  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    addNode,
    loadFromDb,
  } = useStore(selector)

  useEffect(() => {
    if (hasLoadedRef.current) return
    hasLoadedRef.current = true
    loadFromDb()
  }, [loadFromDb])

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()

      const type = event.dataTransfer.getData('application/reactflow') as NodeType

      if (typeof type === 'undefined' || !type) {
        return
      }

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })

      const newNode: OMVNode = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type,
        position,
        data: { text_content: 'New node' },
      }

      addNode(newNode)
    },
    [screenToFlowPosition, addNode]
  )

  return (
    <div style={{ display: 'flex', height: '100%', width: '100%' }}>
      <Sidebar />
      <div style={{ flexGrow: 1, height: '100%' }} ref={reactFlowWrapper}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          onDrop={onDrop}
          onDragOver={onDragOver}
          fitView
        >
        </ReactFlow>
      </div>
    </div>
  )
}

export default function Page() {
  return (
    <ReactFlowProvider>
      <Canvas />
    </ReactFlowProvider>
  )
}
