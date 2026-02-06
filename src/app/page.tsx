'use client'

import React, { useCallback, useRef, useEffect, useMemo, useState } from 'react'
import ReactFlow, {
  ReactFlowProvider,
  useReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  type OnConnectStart,
} from 'reactflow'
import 'reactflow/dist/style.css'

import { useStore } from '@/stores/useStore'
import type { OMVNode, NodeType } from '@/stores/useStore'
import { Sidebar } from '@/components/Sidebar'
import { ObservationNode } from '@/components/nodes/ObservationNode'
import { MechanismNode } from '@/components/nodes/MechanismNode'
import { ValidationNode } from '@/components/nodes/ValidationNode'
import { GhostNode } from '@/components/nodes/GhostNode'
import { getSuggestedTargetTypes } from '@/lib/connection-rules'

const DEBUG_GHOSTS = false

const nodeTypes = {
  OBSERVATION: ObservationNode,
  MECHANISM: MechanismNode,
  VALIDATION: ValidationNode,
  GHOST: GhostNode,
}

function Canvas() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const hasLoadedRef = useRef(false)
  const { screenToFlowPosition, fitView } = useReactFlow()
  
  const nodes = useStore((s) => s.nodes)
  const edges = useStore((s) => s.edges)
  const ghostNodes = useStore((s) => s.ghostNodes)
  const ghostEdges = useStore((s) => s.ghostEdges)
  const [connectingFromType, setConnectingFromType] = useState<NodeType | null>(null)
  
  const aiError = useStore((s) => s.aiError)
  const onNodesChange = useStore((s) => s.onNodesChange)
  const onEdgesChange = useStore((s) => s.onEdgesChange)
  const onConnect = useStore((s) => s.onConnect)
  const addNode = useStore((s) => s.addNode)
  const loadFromDb = useStore((s) => s.loadFromDb)

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

  const allNodes = useMemo(() => {
    const suggestedTargets = connectingFromType ? getSuggestedTargetTypes(connectingFromType) : []

    const decorated = nodes.map((node) => {
      if (suggestedTargets.includes(node.type)) {
        return {
          ...node,
          className: `${node.className ?? ''} ring-2 ring-indigo-400 ring-offset-2`,
        }
      }
      return node
    })

    return [...decorated, ...ghostNodes]
  }, [nodes, ghostNodes, connectingFromType])

  const handleConnectStart: OnConnectStart = useCallback(
    (_event, params) => {
      if (params.handleType !== 'source' || !params.nodeId) return

      const source = nodes.find((n) => n.id === params.nodeId)
      setConnectingFromType((source?.type as NodeType) ?? null)
    },
    [nodes]
  )

  const handleConnectEnd = useCallback(() => {
    setConnectingFromType(null)
  }, [])

  void fitView

  return (
    <div className="flex h-full w-full flex-col bg-slate-100">
      <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white/80 px-6 shadow-sm backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-bold text-sm shadow-sm">
            SF
          </div>
          <h1 className="text-lg font-semibold text-slate-800">StemFlow</h1>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
            BETA
          </span>
        </div>
        <div className="text-xs text-slate-500">
          AI-Assisted Research Canvas
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <div
          className="relative flex-1 overflow-hidden bg-gradient-to-br from-slate-50 via-slate-100 to-slate-200"
          ref={reactFlowWrapper}
          style={{ height: '100%', width: '100%' }}
        >
          {aiError && (
            <div className="absolute right-4 top-4 z-50 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 shadow-lg">
              {aiError}
            </div>
          )}
           <ReactFlow
             nodes={allNodes}
             edges={[...edges, ...ghostEdges]}
             onNodesChange={onNodesChange}
             onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onConnectStart={handleConnectStart}
              onConnectEnd={handleConnectEnd}
              nodeTypes={nodeTypes}
            onDrop={onDrop}
            onDragOver={onDragOver}
            fitView
          >
            <Background 
              variant={BackgroundVariant.Dots} 
              gap={16} 
              size={1}
              color="#cbd5e1"
            />
            <Controls 
              className="rounded-lg border border-slate-200 bg-white/80 shadow-sm backdrop-blur"
            />
            <MiniMap 
              nodeColor={(node) => {
                switch (node.type) {
                  case 'OBSERVATION': return '#3b82f6'
                  case 'MECHANISM': return '#8b5cf6'
                  case 'VALIDATION': return '#10b981'
                  case 'GHOST': return '#94a3b8'
                  default: return '#64748b'
                }
              }}
              className="rounded-lg border border-slate-200 bg-white/80 shadow-sm backdrop-blur"
              maskColor="rgb(241, 245, 249, 0.6)"
            />
          </ReactFlow>
        </div>
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
