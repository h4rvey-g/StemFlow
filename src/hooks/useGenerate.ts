import { useCallback } from 'react'
import { useStore } from '@/stores/useStore'
import { loadApiKeys } from '@/lib/api-keys'
import { planNextDirections, generateStepFromDirection } from '@/lib/ai-service'
import { buildNodeSuggestionContext, getNodeAncestry } from '@/lib/graph'
import { createRightwardSiblingPosition } from '@/lib/node-layout'
import type {
  GenerationErrorPayload,
  GhostEdge,
  GhostNode,
  PlannerDirectionPreview,
} from '@/types/nodes'

type AcceptRetryContext = {
  parentId: string
  plannerDirection: PlannerDirectionPreview
}

const pendingRetryContexts = new Map<string, AcceptRetryContext>()

function classifyGenerationError(error: unknown): GenerationErrorPayload {
  const message = error instanceof Error ? error.message : 'Unknown error occurred'
  const normalized = message.toLowerCase()

  if (
    message.includes('401') ||
    message.includes('403') ||
    normalized.includes('unauthorized') ||
    normalized.includes('invalid api key') ||
    normalized.includes('forbidden')
  ) {
    return { message, code: 'auth', retryable: false }
  }

  if (
    normalized.includes('no supported ai provider') ||
    normalized.includes('no api key found') ||
    normalized.includes('no ai provider selected') ||
    normalized.includes('gemini is not supported')
  ) {
    return { message, code: 'configuration', retryable: false }
  }

  if (normalized.includes('failed to parse')) {
    return { message, code: 'parse', retryable: false }
  }

  if (
    message.includes('429') ||
    normalized.includes('rate limit') ||
    normalized.includes('too many requests')
  ) {
    return { message, code: 'rate_limit', retryable: true }
  }

  if (normalized.includes('network') || normalized.includes('fetch')) {
    return { message, code: 'network', retryable: true }
  }

  return { message, code: 'unknown', retryable: true }
}

export function useGenerate() {
  const nodes = useStore((s) => s.nodes)
  const edges = useStore((s) => s.edges)
  const globalGoal = useStore((s) => s.globalGoal)
  const setGhostSuggestions = useStore((s) => s.setGhostSuggestions)
  const setIsGenerating = useStore((s) => s.setIsGenerating)
  const setAiError = useStore((s) => s.setAiError)
  const isGenerating = useStore((s) => s.isGenerating)
  const createPendingNodeFromGhost = useStore((s) => s.createPendingNodeFromGhost)
  const hydratePendingNode = useStore((s) => s.hydratePendingNode)
  const markPendingNodeError = useStore((s) => s.markPendingNodeError)
  const retryPendingNodeGenerationInStore = useStore((s) => s.retryPendingNodeGeneration)

  const runAcceptGeneration = useCallback(async (
    pendingNodeId: string,
    context: AcceptRetryContext
  ) => {
    try {
      const {
        provider,
        openaiKey,
        anthropicKey,
        openaiModel,
        anthropicModel,
        openaiBaseUrl,
        anthropicBaseUrl,
      } = await loadApiKeys()

      if (!provider || provider === 'gemini') {
        throw new Error('No supported AI provider configured.')
      }

      const apiKey = provider === 'openai' || provider === 'openai-compatible' ? openaiKey : anthropicKey
      const model = provider === 'openai' || provider === 'openai-compatible' ? openaiModel : anthropicModel
      const baseUrl = provider === 'openai' || provider === 'openai-compatible' ? openaiBaseUrl : anthropicBaseUrl

      if (!apiKey) {
        throw new Error('No API key found. Please configure settings.')
      }

      const { nodes: currentNodes, edges: currentEdges, globalGoal: currentGoal } = useStore.getState()
      const ancestry = getNodeAncestry(context.parentId, currentNodes, currentEdges)
      const gradedNodes = buildNodeSuggestionContext(currentNodes)

      const step = await generateStepFromDirection(
        context.plannerDirection,
        ancestry,
        currentGoal,
        provider,
        apiKey,
        model,
        baseUrl,
        gradedNodes
      )

      hydratePendingNode(pendingNodeId, {
        text_content: step.text_content,
        summary_title: step.summary_title,
        citations: step.citations,
      })

      pendingRetryContexts.delete(pendingNodeId)
    } catch (error) {
      markPendingNodeError(pendingNodeId, classifyGenerationError(error))
    }
  }, [hydratePendingNode, markPendingNodeError])

  /**
   * Triggers Phase 1 (Planner Preview).
   * Generates lightweight directions and populates the canvas with ghost nodes.
   */
  const generate = useCallback(async (nodeId: string) => {
    setIsGenerating(true)
    setAiError(null)

    try {
      const {
        provider,
        openaiKey,
        anthropicKey,
        geminiKey,
        openaiModel,
        anthropicModel,
        openaiBaseUrl,
        anthropicBaseUrl,
      } = await loadApiKeys()

      if (!provider) {
        throw new Error('No AI provider selected. Please configure settings.')
      }

      if (provider === 'gemini') {
        if (!geminiKey) {
          throw new Error('No API key found. Please configure settings.')
        }

        throw new Error('Gemini is not supported in this generation flow yet.')
      }

      const apiKey = provider === 'openai' || provider === 'openai-compatible' ? openaiKey : anthropicKey
      const model = provider === 'openai' || provider === 'openai-compatible' ? openaiModel : anthropicModel
      const baseUrl = provider === 'openai' || provider === 'openai-compatible' ? openaiBaseUrl : anthropicBaseUrl

      if (!apiKey) {
        throw new Error('No API key found. Please configure settings.')
      }

      const ancestry = getNodeAncestry(nodeId, nodes, edges)
      const gradedNodes = buildNodeSuggestionContext(nodes)
      const parentNode = nodes.find((n) => n.id === nodeId)

      if (!parentNode) {
        throw new Error('Node not found')
      }

      const steps = await planNextDirections(
        ancestry,
        globalGoal,
        provider,
        apiKey,
        model,
        baseUrl,
        gradedNodes
      )

      const ghostNodes: GhostNode[] = steps.slice(0, 3).map((step, index) => {
        const ghostId = `ghost-${Date.now()}-${index}`
        const plannerDirection: PlannerDirectionPreview = {
          id: `${ghostId}-direction`,
          summary_title: step.summary_title ?? `Direction ${index + 1}`,
          suggestedType: step.suggestedType,
          searchQuery: step.searchQuery,
          sourceNodeId: nodeId,
        }

        return {
        id: ghostId,
        type: 'GHOST' as const,
        position: createRightwardSiblingPosition(parentNode.position, index),
        data: {
          summary_title: plannerDirection.summary_title,
          suggestedType: plannerDirection.suggestedType,
          parentId: nodeId,
          ghostId,
          plannerDirection,
          generationStatus: 'pending',
          text_content: undefined,
        },
      }
      })

      const ghostEdges: GhostEdge[] = ghostNodes.map((node) => ({
        id: `ghost-edge-${nodeId}-${node.id}`,
        source: nodeId,
        target: node.id,
        style: { strokeDasharray: '6 4', stroke: '#64748b' },
        animated: false,
        selectable: false,
        deletable: false,
        focusable: false,
        data: { ghost: true },
      }))

      setGhostSuggestions(ghostNodes, ghostEdges)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error occurred'
      setAiError(message)
    } finally {
      setIsGenerating(false)
    }
  }, [
    nodes,
    edges,
    globalGoal,
    setGhostSuggestions,
    setIsGenerating,
    setAiError,
  ])

  /**
   * Triggers Phase 2 (Accept-Time Generation).
   * Converts a ghost node to a pending real node and starts full content generation.
   */
  const acceptGhost = useCallback(async (ghostId: string) => {
    const ghost = useStore.getState().ghostNodes.find((g) => g.id === ghostId)
    if (!ghost) return

    const pendingNodeId = createPendingNodeFromGhost(ghostId)
    if (!pendingNodeId) return

    pendingRetryContexts.set(pendingNodeId, {
      parentId: ghost.data.parentId,
      plannerDirection: ghost.data.plannerDirection,
    })

    await runAcceptGeneration(pendingNodeId, {
      parentId: ghost.data.parentId,
      plannerDirection: ghost.data.plannerDirection,
    })
  }, [
    createPendingNodeFromGhost,
    runAcceptGeneration,
  ])

  /**
   * Retries generation for a node that failed.
   * Uses the cached AcceptRetryContext to ensure the same direction is used.
   */
  const retryPendingNodeGeneration = useCallback(async (pendingNodeId: string) => {
    const retryContext = pendingRetryContexts.get(pendingNodeId)
    if (!retryContext) return

    const retryStarted = retryPendingNodeGenerationInStore(pendingNodeId)
    if (!retryStarted) return

    await runAcceptGeneration(pendingNodeId, retryContext)
  }, [
    retryPendingNodeGenerationInStore,
    runAcceptGeneration,
  ])

  return { generate, acceptGhost, retryPendingNodeGeneration, isGenerating }
}
