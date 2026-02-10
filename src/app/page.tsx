'use client'

import React, { useCallback, useRef, useEffect, useMemo, useState } from 'react'
import ReactFlow, {
  ReactFlowProvider,
  useReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  type DefaultEdgeOptions,
  type OnConnectStart,
  type Edge,
  type Node,
  type NodeChange,
} from 'reactflow'
import 'reactflow/dist/style.css'

import { useStore } from '@/stores/useStore'
import type { OMVNode, NodeType } from '@/stores/useStore'
import { Sidebar } from '@/components/Sidebar'
import { ObservationNode } from '@/components/nodes/ObservationNode'
import { MechanismNode } from '@/components/nodes/MechanismNode'
import { ValidationNode } from '@/components/nodes/ValidationNode'
import { GhostNode } from '@/components/nodes/GhostNode'
import { ManualGroupNode } from '@/components/nodes/ManualGroupNode'
import { getSuggestedTargetTypes } from '@/lib/connection-rules'
import { buildManualGroupNodes } from '@/lib/graph'

const DEBUG_GHOSTS = false

const nodeTypes = {
  OBSERVATION: ObservationNode,
  MECHANISM: MechanismNode,
  VALIDATION: ValidationNode,
  GHOST: GhostNode,
  MANUAL_GROUP: ManualGroupNode,
}

const defaultEdgeOptions: DefaultEdgeOptions = {
  type: 'smoothstep',
  style: {
    stroke: '#94a3b8',
    strokeWidth: 1.6,
  },
}

const AlignIcon = () => (
  <svg
    className="h-4 w-4"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h14" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12h10" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 18h14" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 4v16" />
  </svg>
)

function Canvas() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const hasLoadedRef = useRef(false)
  const { screenToFlowPosition, fitView, getNodes } = useReactFlow()
  
  const nodes = useStore((s) => s.nodes)
  const edges = useStore((s) => s.edges)
  const ghostNodes = useStore((s) => s.ghostNodes)
  const ghostEdges = useStore((s) => s.ghostEdges)
  const manualGroups = useStore((s) => s.manualGroups)
  const [connectingFromType, setConnectingFromType] = useState<NodeType | null>(null)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([])
  const persistedSelectionRef = useRef<string[]>([])
  
  const aiError = useStore((s) => s.aiError)
  const storeOnNodesChange = useStore((s) => s.onNodesChange)
  const onEdgesChange = useStore((s) => s.onEdgesChange)
  const onConnect = useStore((s) => s.onConnect)
  const addNode = useStore((s) => s.addNode)
  const loadFromDb = useStore((s) => s.loadFromDb)
  const formatCanvas = useStore((s) => s.formatCanvas)
  const createManualGroup = useStore((s) => s.createManualGroup)
  const deleteManualGroup = useStore((s) => s.deleteManualGroup)

  useEffect(() => {
    if (selectedNodeIds.length >= 2) {
      persistedSelectionRef.current = selectedNodeIds
    }
  }, [selectedNodeIds])

  useEffect(() => {
    const selectedFromStore = nodes
      .filter(
        (node) =>
          node.selected === true &&
          (node.type === 'OBSERVATION' || node.type === 'MECHANISM' || node.type === 'VALIDATION')
      )
      .map((node) => node.id)

    if (selectedFromStore.length === 0) return
    setSelectedNodeIds(selectedFromStore)
  }, [nodes])

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
    const groupedNodes = buildManualGroupNodes(nodes, manualGroups)
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

    return [...groupedNodes, ...decorated, ...ghostNodes]
  }, [nodes, manualGroups, ghostNodes, connectingFromType])

  const displayEdges = useMemo(() => {
    const combinedEdges = [...edges, ...ghostEdges]

    if (!hoveredNodeId) {
      return combinedEdges
    }

    return combinedEdges.map((edge) => {
      const isConnected = edge.source === hoveredNodeId || edge.target === hoveredNodeId
      const isGhostEdge = edge.id.startsWith('ghost-edge-') || edge.data?.ghost === true

      if (isConnected) {
        return {
          ...edge,
          zIndex: 20,
          style: {
            ...edge.style,
            opacity: 1,
            stroke: isGhostEdge ? '#64748b' : '#334155',
            strokeWidth: isGhostEdge ? 2 : 2.4,
          },
        }
      }

      return {
        ...edge,
        zIndex: 1,
        style: {
          ...edge.style,
          opacity: isGhostEdge ? 0.1 : 0.18,
        },
      }
    })
  }, [edges, ghostEdges, hoveredNodeId])

  const handleNodeMouseEnter = useCallback((_event: React.MouseEvent, node: Node) => {
    if (node.type === 'MANUAL_GROUP') return
    setHoveredNodeId(node.id)
  }, [])

  const handleNodeMouseLeave = useCallback((_event: React.MouseEvent, _node: Node) => {
    setHoveredNodeId(null)
  }, [])

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

  const handleSelectionChange = useCallback(({ nodes: selectedNodes }: { nodes: Node[] }) => {
    const nextIds = selectedNodes
      .filter(
        (node) =>
          node.type === 'OBSERVATION' || node.type === 'MECHANISM' || node.type === 'VALIDATION'
      )
      .map((node) => node.id)
    setSelectedNodeIds(nextIds)
  }, [])

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const isManualGroupNode = (id: string) => id.startsWith('manual-group-')

      const manualGroupPositionChanges: NodeChange[] = []
      const manualGroupRemoveChanges: NodeChange[] = []
      const otherChanges: NodeChange[] = []

      for (const change of changes) {
        if (!('id' in change) || typeof change.id !== 'string') {
          otherChanges.push(change)
          continue
        }

        if (isManualGroupNode(change.id)) {
          if (change.type === 'position' && change.dragging && change.position) {
            manualGroupPositionChanges.push(change)
          } else if (change.type === 'remove') {
            manualGroupRemoveChanges.push(change)
          }
          continue
        }

        if (!isManualGroupNode(change.id)) {
          otherChanges.push(change)
        }
      }

      for (const removeChange of manualGroupRemoveChanges) {
        if (removeChange.type === 'remove' && 'id' in removeChange) {
          const groupId = removeChange.id.replace('manual-group-', '')
          deleteManualGroup(groupId)
        }
      }

      const groupPositionChanges = [...manualGroupPositionChanges]

      if (groupPositionChanges.length > 0) {
        const currentNodes = getNodes()
        const memberPositionChanges: NodeChange[] = []

        for (const groupChange of groupPositionChanges) {
          if (groupChange.type !== 'position' || !groupChange.position) continue

          const groupNode = currentNodes.find((node) => node.id === groupChange.id)
          if (!groupNode || groupNode.type !== 'MANUAL_GROUP') {
            continue
          }

          const deltaX = groupChange.position.x - groupNode.position.x
          const deltaY = groupChange.position.y - groupNode.position.y

          const memberNodeIds = (groupNode.data as { nodeIds?: string[] }).nodeIds ?? []
          for (const memberId of memberNodeIds) {
            const memberNode = currentNodes.find((node) => node.id === memberId)
            if (memberNode) {
              memberPositionChanges.push({
                id: memberId,
                type: 'position',
                position: {
                  x: memberNode.position.x + deltaX,
                  y: memberNode.position.y + deltaY,
                },
                dragging: true,
              })
            }
          }
        }

        if (memberPositionChanges.length > 0) {
          storeOnNodesChange([...otherChanges, ...memberPositionChanges])
          return
        }
      }

      if (otherChanges.length > 0) {
        storeOnNodesChange(otherChanges)
      }
    },
    [storeOnNodesChange, getNodes, deleteManualGroup]
  )

  const handleGroupSelectedMouseDown = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault()
      event.stopPropagation()

      const allCanvasNodes = getNodes()

      const selectedIdsFromCanvas = allCanvasNodes
        .filter(
          (node) =>
            node.selected === true &&
            (node.type === 'OBSERVATION' || node.type === 'MECHANISM' || node.type === 'VALIDATION')
        )
        .map((node) => node.id)

      const candidateIds = selectedIdsFromCanvas.length >= 2 ? selectedIdsFromCanvas : selectedNodeIds

      if (candidateIds.length >= 2) {
        persistedSelectionRef.current = candidateIds
        createManualGroup(candidateIds)
        return
      }

      if (persistedSelectionRef.current.length >= 2) {
        createManualGroup(persistedSelectionRef.current)
      }
    },
    [createManualGroup, getNodes, selectedNodeIds]
  )

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
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <button
            onMouseDown={handleGroupSelectedMouseDown}
            className="inline-flex items-center gap-2 rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-xs font-semibold text-cyan-700 transition-colors hover:border-cyan-300 hover:bg-cyan-100"
            data-testid="topbar-group-selected"
          >
            Group Selected ({selectedNodeIds.length})
          </button>
          <button
            onClick={formatCanvas}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50"
            data-testid="topbar-format-canvas"
          >
            <AlignIcon />
            Align Nodes
          </button>
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
              edges={displayEdges as Edge[]}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onConnectStart={handleConnectStart}
              onConnectEnd={handleConnectEnd}
              onSelectionChange={handleSelectionChange}
              onNodeMouseEnter={handleNodeMouseEnter}
              onNodeMouseLeave={handleNodeMouseLeave}
              nodeTypes={nodeTypes}
              defaultEdgeOptions={defaultEdgeOptions}
              selectionOnDrag
              selectionKeyCode="Shift"
              multiSelectionKeyCode={['Meta', 'Control', 'Shift']}
              deleteKeyCode={['Backspace', 'Delete']}
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
