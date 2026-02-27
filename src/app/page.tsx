'use client'

import React, { useCallback, useRef, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTheme } from 'next-themes'
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
import { useProjectStore } from '@/stores/useProjectStore'
import { LANGUAGE_STORAGE_KEY, type SupportedLanguage } from '@/lib/i18n'
import type { OMVNode, NodeType } from '@/stores/useStore'
import { Sidebar } from '@/components/Sidebar'
import { ObservationNode } from '@/components/nodes/ObservationNode'
import { MechanismNode } from '@/components/nodes/MechanismNode'
import { ValidationNode } from '@/components/nodes/ValidationNode'
import { GhostNode } from '@/components/nodes/GhostNode'
import { ManualGroupNode } from '@/components/nodes/ManualGroupNode'
import { InspectorPanel } from '@/components/ui/InspectorPanel'
import { InspectorAiActions } from '@/components/ui/InspectorAiActions'
import { InspectorAttachments } from '@/components/ui/InspectorAttachments'
import { NodeChatPanel } from '@/components/ui/NodeChatPanel'
import { OnboardingPopup } from '@/components/ui/OnboardingPopup'
import { EmptyCanvasOverlay } from '@/components/ui/EmptyCanvasOverlay'
import { getSuggestedTargetTypes, isConnectionSuggested } from '@/lib/connection-rules'
import { buildManualGroupNodes } from '@/lib/graph'
import type { NodeData, NodeFileAttachment } from '@/types/nodes'

const DEBUG_GHOSTS = false
const AUTO_CONNECT_PROXIMITY_PX = 150
const GHOST_FRAME_PADDING_PX = 18
const GHOST_ACTION_BAR_GAP_PX = 12
const GHOST_ACTION_BAR_HEIGHT_PX = 42
const FALLBACK_GHOST_NODE_WIDTH_PX = 320
const FALLBACK_GHOST_NODE_HEIGHT_PX = 190
const ONBOARDING_SHOWN_KEY_PREFIX = 'stemflow:onboardingShown'

type OnboardingNodeType = 'OBSERVATION' | 'MECHANISM'

type SidebarNodeType = Exclude<NodeType, 'GHOST'>

type DragDropPreview = {
  draggedType: SidebarNodeType
  existingNodeId: string
  newNodeIsSource: boolean
  position: {
    x: number
    y: number
  }
  cursor: {
    x: number
    y: number
  }
}

const isSidebarNodeType = (value: string): value is SidebarNodeType =>
  value === 'OBSERVATION' || value === 'MECHANISM' || value === 'VALIDATION'

const normalizeAttachments = (nodeData?: NodeData): NodeFileAttachment[] => {
  if (Array.isArray(nodeData?.attachments)) return nodeData.attachments
  if (!nodeData?.fileMetadata) return []
  return [{
    ...nodeData.fileMetadata,
    processingStatus: nodeData.fileProcessingStatus ?? 'ready',
    processingError: nodeData.fileProcessingError ?? null,
    textExcerpt: nodeData.fileTextExcerpt ?? null,
    imageDescription: nodeData.imageDescription ?? null,
  }]
}

const getStorageErrorMeta = (error: unknown): { name: string; message: string } => {
  if (error && typeof error === 'object') {
    const name =
      'name' in error && typeof (error as { name?: unknown }).name === 'string'
        ? (error as { name: string }).name
        : 'Error'
    const message =
      'message' in error && typeof (error as { message?: unknown }).message === 'string'
        ? (error as { message: string }).message
        : 'Unknown localStorage error'

    return { name, message }
  }

  if (typeof error === 'string') {
    return { name: 'Error', message: error }
  }

  return { name: 'Error', message: 'Unknown localStorage error' }
}

const getNodeCenter = (node: OMVNode) => {
  const width = typeof node.width === 'number' ? node.width : 0
  const height = typeof node.height === 'number' ? node.height : 0
  return {
    x: node.position.x + width / 2,
    y: node.position.y + height / 2,
  }
}

const findAutoConnectTarget = (
  position: { x: number; y: number },
  draggedType: SidebarNodeType,
  canvasNodes: OMVNode[],
  zoom: number
) => {
  let nearestNode: OMVNode | null = null
  let nearestDistance = Number.POSITIVE_INFINITY

  for (const node of canvasNodes) {
    const center = getNodeCenter(node)
    const distance = Math.hypot(center.x - position.x, center.y - position.y)
    if (distance < nearestDistance) {
      nearestNode = node
      nearestDistance = distance
    }
  }

  const normalizedZoom = zoom > 0 ? zoom : 1
  const threshold = AUTO_CONNECT_PROXIMITY_PX / normalizedZoom

  if (!nearestNode || nearestDistance > threshold) {
    return null
  }

  const targetNode = nearestNode
  const existingToNewSuggested = isConnectionSuggested(targetNode.type, draggedType)
  const newToExistingSuggested = isConnectionSuggested(draggedType, targetNode.type)

  return {
    existingNodeId: targetNode.id,
    newNodeIsSource: newToExistingSuggested && !existingToNewSuggested,
  }
}

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

const EarthIcon = () => (
  <svg
    className="h-4 w-4"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 3a9 9 0 100 18 9 9 0 000-18zm0 0c2.485 2.54 3.75 5.54 3.75 9S14.485 18.46 12 21m0-18C9.515 5.54 8.25 8.54 8.25 12S9.515 18.46 12 21m-8.62-6h17.24M3.38 9h17.24"
    />
  </svg>
)

const SunIcon = () => (
  <svg
    className="h-4 w-4"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden
  >
    <circle cx="12" cy="12" r="4" strokeWidth={2} />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2v2.5M12 19.5V22M4.93 4.93l1.77 1.77M17.3 17.3l1.77 1.77M2 12h2.5M19.5 12H22M4.93 19.07l1.77-1.77M17.3 6.7l1.77-1.77" />
  </svg>
)

const MoonIcon = () => (
  <svg
    className="h-4 w-4"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden
  >
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z" />
  </svg>
)

function Canvas() {
  const { t, i18n } = useTranslation()
  const { theme, setTheme } = useTheme()
  const [isThemeMounted, setIsThemeMounted] = useState(false)
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const { screenToFlowPosition, fitView, getNodes, getZoom, getViewport } = useReactFlow()
  
  const nodes = useStore((s) => s.nodes)
  const edges = useStore((s) => s.edges)
  const ghostNodes = useStore((s) => s.ghostNodes)
  const ghostEdges = useStore((s) => s.ghostEdges)
  const manualGroups = useStore((s) => s.manualGroups)
  const [connectingFromType, setConnectingFromType] = useState<NodeType | null>(null)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [sidebarDragType, setSidebarDragType] = useState<SidebarNodeType | null>(null)
  const [dragDropPreview, setDragDropPreview] = useState<DragDropPreview | null>(null)
  const [viewport, setViewport] = useState(() => ({ x: 0, y: 0, zoom: 1 }))
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([])
  const persistedSelectionRef = useRef<string[]>([])
  const [inspectorNodeId, setInspectorNodeId] = useState<string | null>(null)
  const [chatNodeId, setChatNodeId] = useState<string | null>(null)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [hydratedProjectId, setHydratedProjectId] = useState<string | null>(null)
  
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const isProjectLoaded = useProjectStore((s) => s.isLoaded)
  const projects = useProjectStore((s) => s.projects)
  const activeProject = projects.find((p) => p.id === activeProjectId)

  const aiError = useStore((s) => s.aiError)
  const storeOnNodesChange = useStore((s) => s.onNodesChange)
  const onEdgesChange = useStore((s) => s.onEdgesChange)
  const onConnect = useStore((s) => s.onConnect)
  const addNode = useStore((s) => s.addNode)
  const addEdge = useStore((s) => s.addEdge)
  const loadFromDb = useStore((s) => s.loadFromDb)
  const updateNode = useStore((s) => s.updateNode)
  const formatCanvas = useStore((s) => s.formatCanvas)
  const acceptAllGhostNodes = useStore((s) => s.acceptAllGhostNodes)
  const dismissAllGhostNodes = useStore((s) => s.dismissAllGhostNodes)
  const createManualGroup = useStore((s) => s.createManualGroup)
  const deleteManualGroup = useStore((s) => s.deleteManualGroup)
  const undoLastAction = useStore((s) => s.undoLastAction)
  const isCanvasLoading = useStore((s) => s.isLoading)

  const isCanvasEmpty = nodes.length === 0
  const isCanvasHydratedForActiveProject =
    typeof activeProjectId === 'string' && hydratedProjectId === activeProjectId

  const onboardingShownKey = useMemo(
    () => (activeProjectId ? `${ONBOARDING_SHOWN_KEY_PREFIX}:${activeProjectId}` : null),
    [activeProjectId]
  )

  const readOnboardingShown = useCallback((key: string): boolean => {
    try {
      return window.localStorage.getItem(key) === 'true'
    } catch (error) {
      const { name, message } = getStorageErrorMeta(error)
      if (name === 'QuotaExceededError') {
      console.warn(`Failed to read onboarding shown state: ${name}: ${message}`)
      } else {
        console.error(`Failed to read onboarding shown state: ${name}: ${message}`)
      }
      return false
    }
  }, [])

  const persistOnboardingShown = useCallback((key: string) => {
    try {
      window.localStorage.setItem(key, 'true')
    } catch (error) {
      const { name, message } = getStorageErrorMeta(error)
      if (name === 'QuotaExceededError') {
        console.warn(`Failed to persist onboarding shown state: ${name}: ${message}`)
      } else {
        console.error(`Failed to persist onboarding shown state: ${name}: ${message}`)
      }
    }
  }, [])

  const markOnboardingSeen = useCallback(() => {
    if (!onboardingShownKey) return
    persistOnboardingShown(onboardingShownKey)
  }, [onboardingShownKey, persistOnboardingShown])

  const handleOnboardingClose = useCallback(() => {
    setShowOnboarding(false)
    markOnboardingSeen()
  }, [markOnboardingSeen])

  const handleOnboardingCreateNode = useCallback(
    (type: OnboardingNodeType, text: string) => {
      const position = screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      })

      const newNode: OMVNode = {
        id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type,
        position,
        data: {
          text_content: text,
        },
      }

      addNode(newNode)
      setShowOnboarding(false)
      markOnboardingSeen()
    },
    [addNode, markOnboardingSeen, screenToFlowPosition]
  )

  const handleOpenOnboarding = useCallback(() => {
    if (!isCanvasHydratedForActiveProject || !isCanvasEmpty) return
    setShowOnboarding(true)
  }, [isCanvasEmpty, isCanvasHydratedForActiveProject])

  useEffect(() => {
    useProjectStore.getState().loadProjects()
  }, [])

  useEffect(() => {
    setIsThemeMounted(true)
  }, [])

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

    if (selectedFromStore.length === 0) {
      setSelectedNodeIds([])
    } else {
      setSelectedNodeIds(selectedFromStore)
    }

    if (inspectorNodeId && !nodes.some((node) => node.id === inspectorNodeId)) {
      setInspectorNodeId(null)
    }
  }, [inspectorNodeId, nodes])

  useEffect(() => {
    if (!isProjectLoaded || !activeProjectId) return

    let cancelled = false

    const loadProjectCanvas = async () => {
      setHydratedProjectId(null)
      try {
        await loadFromDb()
      } finally {
        if (!cancelled) {
          setHydratedProjectId(activeProjectId)
        }
      }
    }

    void loadProjectCanvas()

    return () => {
      cancelled = true
    }
  }, [isProjectLoaded, activeProjectId, loadFromDb])

  useEffect(() => {
    if (!activeProjectId) {
      setHydratedProjectId(null)
      setShowOnboarding(false)
      return
    }

    setShowOnboarding(false)
  }, [activeProjectId])

  useEffect(() => {
    if (!isProjectLoaded || isCanvasLoading || !isCanvasHydratedForActiveProject || !onboardingShownKey) return

    if (!isCanvasEmpty) {
      setShowOnboarding(false)
      return
    }

    const shown = readOnboardingShown(onboardingShownKey)
    setShowOnboarding(!shown)
  }, [
    isProjectLoaded,
    isCanvasLoading,
    isCanvasHydratedForActiveProject,
    onboardingShownKey,
    isCanvasEmpty,
    readOnboardingShown,
  ])

  useEffect(() => {
    const isTextEditingTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false
      const tag = target.tagName
      return (
        target.isContentEditable ||
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT'
      )
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const isUndoKey =
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === 'z' &&
        !event.shiftKey

      if (isUndoKey && !isTextEditingTarget(event.target)) {
        event.preventDefault()
        undoLastAction()
        return
      }

      const isSelectAllKey = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a'
      if (!isSelectAllKey || isTextEditingTarget(event.target)) return

      event.preventDefault()

      if (nodes.length === 0) return

      storeOnNodesChange(
        nodes.map((node) => ({
          id: node.id,
          type: 'select' as const,
          selected: true,
        }))
      )
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [nodes, storeOnNodesChange, undoLastAction])

  const clearDragDropPreview = useCallback(() => {
    setDragDropPreview(null)
  }, [])

  const nodeTypeLabelMap = useMemo<Record<SidebarNodeType, string>>(
    () => ({
      OBSERVATION: t('nodes.observation.title'),
      MECHANISM: t('nodes.mechanism.title'),
      VALIDATION: t('nodes.validation.title'),
    }),
    [t]
  )

  useEffect(() => {
    const handleDragEnd = () => {
      setSidebarDragType(null)
      setDragDropPreview(null)
    }

    const handleSidebarDragStart = (event: Event) => {
      if (!(event instanceof CustomEvent)) return
      const detail = event.detail
      const nodeType =
        detail && typeof detail === 'object' && 'nodeType' in detail
          ? (detail.nodeType as string)
          : ''

      if (isSidebarNodeType(nodeType)) {
        setSidebarDragType(nodeType)
      }
    }

    const handleSidebarDragEnd = () => {
      setSidebarDragType(null)
      setDragDropPreview(null)
    }

    const handleReadMoreIntent = (event: Event) => {
      if (!(event instanceof CustomEvent)) return
      const detail = event.detail
      const nodeId = detail && typeof detail === 'object' && 'nodeId' in detail
        ? (detail.nodeId as string)
        : null
      
      if (nodeId) {
        setInspectorNodeId(nodeId)
      }
    }
    const handleOpenChat = (event: Event) => {
      if (!(event instanceof CustomEvent)) return
      const detail = event.detail
      const nodeId = detail && typeof detail === 'object' && 'nodeId' in detail
        ? (detail.nodeId as string)
        : null
      
      if (nodeId) {
        setChatNodeId(nodeId)
      }
    }

    window.addEventListener('dragend', handleDragEnd)
    window.addEventListener('stemflow:sidebar-drag-start', handleSidebarDragStart as EventListener)
    window.addEventListener('stemflow:sidebar-drag-end', handleSidebarDragEnd)
    window.addEventListener('stemflow:read-more-intent', handleReadMoreIntent as EventListener)
    window.addEventListener('stemflow:open-chat', handleOpenChat as EventListener)
    return () => {
      window.removeEventListener('dragend', handleDragEnd)
      window.removeEventListener('stemflow:sidebar-drag-start', handleSidebarDragStart as EventListener)
      window.removeEventListener('stemflow:sidebar-drag-end', handleSidebarDragEnd)
      window.removeEventListener('stemflow:read-more-intent', handleReadMoreIntent as EventListener)
      window.removeEventListener('stemflow:open-chat', handleOpenChat as EventListener)
    }
  }, [])

  const onDragOver = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'

      const fromTransfer = event.dataTransfer.getData('application/reactflow')
      const rawType = isSidebarNodeType(fromTransfer) ? fromTransfer : sidebarDragType

      if (!rawType) {
        clearDragDropPreview()
        return
      }

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })

      const target = findAutoConnectTarget(position, rawType, nodes, getZoom())
      if (!target) {
        clearDragDropPreview()
        return
      }

      const wrapperRect = reactFlowWrapper.current?.getBoundingClientRect()
      if (!wrapperRect) return

      const nextPreview: DragDropPreview = {
        draggedType: rawType,
        existingNodeId: target.existingNodeId,
        newNodeIsSource: target.newNodeIsSource,
        position,
        cursor: {
          x: event.clientX - wrapperRect.left,
          y: event.clientY - wrapperRect.top,
        },
      }

      setDragDropPreview((previous) => {
        if (
          previous &&
          previous.draggedType === nextPreview.draggedType &&
          previous.existingNodeId === nextPreview.existingNodeId &&
          previous.newNodeIsSource === nextPreview.newNodeIsSource &&
          Math.abs(previous.position.x - nextPreview.position.x) < 0.5 &&
          Math.abs(previous.position.y - nextPreview.position.y) < 0.5
        ) {
          return previous
        }

        return nextPreview
      })
    },
    [clearDragDropPreview, getZoom, nodes, screenToFlowPosition, sidebarDragType]
  )

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()

      const fromTransfer = event.dataTransfer.getData('application/reactflow')
      const rawType = isSidebarNodeType(fromTransfer) ? fromTransfer : sidebarDragType

      if (!rawType) {
        clearDragDropPreview()
        return
      }

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })

      const newNode: OMVNode = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: rawType,
        position,
        data: { text_content: t('canvas.newNode') },
      }

      addNode(newNode)

      const target = findAutoConnectTarget(position, rawType, nodes, getZoom())
      if (target) {
        const source = target.newNodeIsSource ? newNode.id : target.existingNodeId
        const targetId = target.newNodeIsSource ? target.existingNodeId : newNode.id

        addEdge({
          id: `edge-${source}-${targetId}-${Date.now()}`,
          source,
          target: targetId,
        })
      }

      setSidebarDragType(null)
      clearDragDropPreview()
    },
    [addEdge, addNode, clearDragDropPreview, getZoom, nodes, screenToFlowPosition, sidebarDragType, t]
  )

  const handleCanvasDragLeave = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      const nextTarget = event.relatedTarget
      if (nextTarget instanceof HTMLElement && event.currentTarget.contains(nextTarget)) {
        return
      }
      clearDragDropPreview()
    },
    [clearDragDropPreview]
  )

  const previewTargetNode = useMemo(() => {
    if (!dragDropPreview) return null
    return nodes.find((node) => node.id === dragDropPreview.existingNodeId) ?? null
  }, [dragDropPreview, nodes])

  const previewLine = useMemo(() => {
    if (!dragDropPreview || !previewTargetNode) return null

    const viewport = getViewport()
    const toCanvasPoint = (point: { x: number; y: number }) => ({
      x: point.x * viewport.zoom + viewport.x,
      y: point.y * viewport.zoom + viewport.y,
    })

    const existingCenter = getNodeCenter(previewTargetNode)
    const newNodeCenter = dragDropPreview.position

    const startPoint = dragDropPreview.newNodeIsSource ? newNodeCenter : existingCenter
    const endPoint = dragDropPreview.newNodeIsSource ? existingCenter : newNodeCenter

    return {
      start: toCanvasPoint(startPoint),
      end: toCanvasPoint(endPoint),
    }
  }, [dragDropPreview, getViewport, previewTargetNode])

  const previewTargetLabel =
    previewTargetNode && isSidebarNodeType(previewTargetNode.type)
      ? nodeTypeLabelMap[previewTargetNode.type]
      : t('canvas.nearbyNode')

  const ghostSuggestionCluster = useMemo(() => {
    if (ghostNodes.length === 0) return null

    const ghostRects = ghostNodes.map((ghostNode) => {
      const width =
        typeof ghostNode.width === 'number' && ghostNode.width > 0
          ? ghostNode.width
          : FALLBACK_GHOST_NODE_WIDTH_PX
      const height =
        typeof ghostNode.height === 'number' && ghostNode.height > 0
          ? ghostNode.height
          : FALLBACK_GHOST_NODE_HEIGHT_PX

      return {
        id: ghostNode.id,
        x: ghostNode.position.x,
        y: ghostNode.position.y,
        width,
        height,
      }
    })

    let minX = Number.POSITIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY

    for (const ghostRect of ghostRects) {
      minX = Math.min(minX, ghostRect.x)
      minY = Math.min(minY, ghostRect.y)
      maxX = Math.max(maxX, ghostRect.x + ghostRect.width)
      maxY = Math.max(maxY, ghostRect.y + ghostRect.height)
    }

    const frameX = minX - GHOST_FRAME_PADDING_PX
    const frameY = minY - GHOST_FRAME_PADDING_PX
    const frameWidth = maxX - minX + GHOST_FRAME_PADDING_PX * 2
    const frameHeight = maxY - minY + GHOST_FRAME_PADDING_PX * 2

    const toScreen = (point: { x: number; y: number }) => ({
      x: point.x * viewport.zoom + viewport.x,
      y: point.y * viewport.zoom + viewport.y,
    })

    const topLeft = toScreen({ x: frameX, y: frameY })
    const screenWidth = frameWidth * viewport.zoom
    const screenHeight = frameHeight * viewport.zoom

    const preferredHeaderY = topLeft.y - GHOST_ACTION_BAR_HEIGHT_PX - GHOST_ACTION_BAR_GAP_PX
    const headerY = preferredHeaderY >= 8 ? preferredHeaderY : topLeft.y + screenHeight + GHOST_ACTION_BAR_GAP_PX

    return {
      headerX: topLeft.x + screenWidth / 2,
      headerY,
      count: ghostNodes.length,
    }
  }, [ghostNodes, viewport])

  useEffect(() => {
    setViewport(getViewport())
  }, [getViewport])

  const allNodes = useMemo(() => {
    const groupedNodes = buildManualGroupNodes(nodes, manualGroups)
    const suggestedTargets = connectingFromType ? getSuggestedTargetTypes(connectingFromType) : []

    const decorated = nodes.map((node) => {
      const previewClassName =
        dragDropPreview?.existingNodeId === node.id
          ? ' ring-4 ring-cyan-400 ring-offset-2 ring-offset-slate-100 animate-pulse'
          : ''

      if (suggestedTargets.includes(node.type)) {
        return {
          ...node,
          className: `${node.className ?? ''} ring-2 ring-indigo-400 ring-offset-2${previewClassName}`,
        }
      }

      if (previewClassName) {
        return {
          ...node,
          className: `${node.className ?? ''}${previewClassName}`,
        }
      }

      return node
    })

    const ghostDistances = ghostNodes.map((ghostNode) => {
      const parentNode = nodes.find((node) => node.id === ghostNode.data.parentId)
      if (!parentNode) {
        return {
          id: ghostNode.id,
          distance: 0,
        }
      }

      return {
        id: ghostNode.id,
        distance: Math.hypot(
          ghostNode.position.x - parentNode.position.x,
          ghostNode.position.y - parentNode.position.y
        ),
      }
    })

    const maxGhostDistance = ghostDistances.reduce((maxDistance, entry) => Math.max(maxDistance, entry.distance), 0)
    const ghostDistanceMap = new Map(ghostDistances.map((entry) => [entry.id, entry.distance]))

    const decoratedGhostNodes = ghostNodes.map((ghostNode, index) => {
      const distance = ghostDistanceMap.get(ghostNode.id) ?? 0
      const fallbackRatio = ghostNodes.length > 1 ? index / (ghostNodes.length - 1) : 0
      const ratio = maxGhostDistance > 0 ? distance / maxGhostDistance : fallbackRatio
      const opacity = Number((0.92 - ratio * 0.18).toFixed(2))

      return {
        ...ghostNode,
        style: {
          ...(ghostNode.style ?? {}),
          opacity,
        },
      }
    })

    return [...groupedNodes, ...decorated, ...decoratedGhostNodes]
  }, [nodes, manualGroups, ghostNodes, connectingFromType, dragDropPreview])

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

  const selectedLanguage: SupportedLanguage =
    i18n.language === 'zh-CN' || i18n.language === 'en' ? i18n.language : 'en'
  const isDarkTheme = isThemeMounted && theme === 'dark'

  const handleThemeToggle = useCallback(() => {
    setTheme(isDarkTheme ? 'bright' : 'dark')
  }, [isDarkTheme, setTheme])

  const inspectorNode = inspectorNodeId ? nodes.find((n) => n.id === inspectorNodeId) : null
  const isInspectorOpen = inspectorNode !== null

  const inspectorPlaceholder = useMemo(() => {
    if (!inspectorNode) return ''

    switch (inspectorNode.type) {
      case 'OBSERVATION':
        return t('nodes.observation.placeholder')
      case 'MECHANISM':
        return t('nodes.mechanism.placeholder')
      case 'VALIDATION':
        return t('nodes.validation.placeholder')
      default:
        return ''
    }
  }, [inspectorNode, t])

  const handleInspectorNodeTextChange = useCallback(
    (nextText: string) => {
      if (!inspectorNode) return

      updateNode(inspectorNode.id, {
        data: {
          text_content: nextText,
        },
      })
    },
    [inspectorNode, updateNode]
  )

  const handleLanguageChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const nextLanguage = event.target.value as SupportedLanguage

      void i18n.changeLanguage(nextLanguage)

      try {
        window.localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage)
      } catch (error) {
        console.error('Failed to persist language preference:', error)
      }
    },
    [i18n]
  )

  void fitView

  return (
    <div className="flex h-full w-full flex-col bg-slate-100 dark:bg-slate-950">
      <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white/80 px-6 shadow-sm dark:border-slate-700 dark:bg-slate-900/80">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-bold text-sm shadow-sm">
            SF
          </div>
          <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            {activeProject ? activeProject.name : t('canvas.appName')}
          </h1>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-300">
            {t('canvas.beta')}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-300">
          <button
            onClick={handleThemeToggle}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-700"
            aria-label={isDarkTheme ? t('canvas.switchToBrightTheme') : t('canvas.switchToDarkTheme')}
            title={isDarkTheme ? t('canvas.switchToBrightTheme') : t('canvas.switchToDarkTheme')}
            data-testid="topbar-theme-toggle"
          >
            {isDarkTheme ? <SunIcon /> : <MoonIcon />}
          </button>
          <label
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            aria-label={t('canvas.switchLanguage')}
            title={t('canvas.switchLanguage')}
          >
            <EarthIcon />
            <select
              value={selectedLanguage}
              onChange={handleLanguageChange}
              className="bg-transparent text-xs font-semibold text-slate-700 outline-none dark:text-slate-200"
              aria-label={t('canvas.switchLanguage')}
              data-testid="topbar-language-select"
            >
              <option value="en">English</option>
              <option value="zh-CN">简体中文</option>
            </select>
          </label>
          <button
            onMouseDown={handleGroupSelectedMouseDown}
            className="inline-flex items-center gap-2 rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-xs font-semibold text-cyan-700 transition-colors hover:border-cyan-300 hover:bg-cyan-100 dark:border-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-200 dark:hover:border-cyan-600 dark:hover:bg-cyan-900/50"
            data-testid="topbar-group-selected"
          >
            {t('canvas.groupSelected', { count: selectedNodeIds.length })}
          </button>
          <button
            onClick={formatCanvas}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-700"
            data-testid="topbar-format-canvas"
          >
            <AlignIcon />
            {t('canvas.alignNodes')}
          </button>
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <div
          className="relative flex-1 overflow-hidden bg-gradient-to-br from-slate-50 via-slate-100 to-slate-200 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800"
          ref={reactFlowWrapper}
          onDragLeave={handleCanvasDragLeave}
          style={{ height: '100%', width: '100%' }}
        >
          {aiError && (
            <div className="absolute right-4 top-4 z-50 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 shadow-lg">
              {aiError}
            </div>
          )}
          {isCanvasHydratedForActiveProject && isCanvasEmpty && !showOnboarding ? (
            <EmptyCanvasOverlay onGetStarted={handleOpenOnboarding} />
          ) : null}
          {dragDropPreview && previewTargetNode && (
            <>
              {previewLine && (
                <svg className="pointer-events-none absolute inset-0 z-20 overflow-visible" aria-hidden>
                  <defs>
                    <linearGradient id="drag-link-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.75" />
                      <stop offset="100%" stopColor="#0891b2" stopOpacity="1" />
                    </linearGradient>
                  </defs>
                  <line
                    x1={previewLine.start.x}
                    y1={previewLine.start.y}
                    x2={previewLine.end.x}
                    y2={previewLine.end.y}
                    stroke="url(#drag-link-gradient)"
                    strokeWidth={3}
                    strokeDasharray="8 8"
                    strokeLinecap="round"
                    opacity={0.9}
                  />
                </svg>
              )}
              <div
                className="pointer-events-none absolute z-30 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-cyan-500 bg-white/80 shadow-[0_0_0_10px_rgba(14,165,233,0.2)]"
                style={{ left: dragDropPreview.cursor.x, top: dragDropPreview.cursor.y }}
                aria-hidden
              />
              <div
                className="pointer-events-none absolute z-30 rounded-lg border border-cyan-200 bg-white/95 px-2.5 py-1.5 text-xs font-semibold text-cyan-700 shadow-md"
                style={{
                  left: dragDropPreview.cursor.x + 16,
                  top: Math.max(12, dragDropPreview.cursor.y - 12),
                  transform: 'translateY(-100%)',
                }}
                aria-hidden
              >
                {t('canvas.releaseToConnect', { target: previewTargetLabel })}
              </div>
            </>
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
              connectionRadius={32}
              selectionOnDrag
              selectionKeyCode="Shift"
              multiSelectionKeyCode={['Meta', 'Control', 'Shift']}
              deleteKeyCode={['Backspace', 'Delete']}
              onDrop={onDrop}
              onDragOver={onDragOver}
              onMove={(_event, nextViewport) => setViewport(nextViewport)}
              fitView
            >
            <Background 
              variant={BackgroundVariant.Dots} 
              gap={16} 
              size={1}
              color="#cbd5e1"
            />
            <Controls 
              className="rounded-lg border border-slate-200 bg-white/80 shadow-sm dark:border-slate-700 dark:bg-slate-900/80"
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
              className="rounded-lg border border-slate-200 bg-white/80 shadow-sm dark:border-slate-700 dark:bg-slate-900/80"
              maskColor="rgb(241, 245, 249, 0.6)"
            />
            {ghostSuggestionCluster ? (
              <>
                <div
                  className="absolute flex items-center gap-1.5"
                  style={{
                    left: ghostSuggestionCluster.headerX,
                    top: ghostSuggestionCluster.headerY,
                    transform: 'translateX(-50%)',
                    zIndex: 45,
                  }}
                  data-testid="ghost-suggestion-actions"
                >
                  <button
                    onClick={acceptAllGhostNodes}
                    className="inline-flex items-center rounded-full border border-emerald-300/80 bg-white/88 px-3 py-1 text-xs font-semibold text-emerald-700 transition-colors hover:border-emerald-400 hover:bg-emerald-50"
                    data-testid="ghost-group-accept-all"
                  >
                    {t('canvas.acceptAll', { count: ghostSuggestionCluster.count })}
                  </button>
                  <button
                    onClick={dismissAllGhostNodes}
                    className="inline-flex items-center rounded-full border border-slate-300/80 bg-white/88 px-2.5 py-1 text-xs font-semibold text-slate-600 transition-colors hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
                    data-testid="ghost-group-dismiss-all"
                  >
                    {t('canvas.dismissAll')}
                  </button>
                </div>
              </>
            ) : null}
          </ReactFlow>
          <OnboardingPopup
            isOpen={showOnboarding && isCanvasHydratedForActiveProject && isCanvasEmpty}
            onClose={handleOnboardingClose}
            onCreateNode={handleOnboardingCreateNode}
          />
        </div>
        <InspectorPanel 
          isOpen={isInspectorOpen} 
          onClose={() => setInspectorNodeId(null)}
          nodeText={inspectorNode?.data.text_content}
          nodeType={inspectorNode?.type as 'OBSERVATION' | 'MECHANISM' | 'VALIDATION' | 'GHOST'}
          summaryTitle={inspectorNode?.data.summary_title}
          translatedTitle={inspectorNode?.data.translated_title}
          translatedTextContent={inspectorNode?.data.translated_text_content}
          translatedLanguage={inspectorNode?.data.translated_language}
          nodePlaceholder={inspectorPlaceholder}
          onNodeTextChange={inspectorNode ? handleInspectorNodeTextChange : undefined}
          citations={inspectorNode?.data.citations}
        >
          {inspectorNode && (
            <>
              <InspectorAttachments attachments={normalizeAttachments(inspectorNode.data)} />
              {inspectorNode.type !== 'GHOST' ? (
                <InspectorAiActions nodeId={inspectorNode.id} />
              ) : null}
            </>
          )}
        </InspectorPanel>
        <NodeChatPanel nodeId={chatNodeId} onClose={() => setChatNodeId(null)} />
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
