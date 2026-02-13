import { useCallback } from 'react'
import { useStore } from '@/stores/useStore'
import { loadApiKeys } from '@/lib/api-keys'
import { generateNextSteps } from '@/lib/ai-service'
import { buildNodeSuggestionContext, getNodeAncestry } from '@/lib/graph'
import { createRightwardSiblingPosition } from '@/lib/node-layout'
import type { GhostEdge, GhostNode } from '@/types/nodes'

export function useGenerate() {
  const nodes = useStore((s) => s.nodes)
  const edges = useStore((s) => s.edges)
  const globalGoal = useStore((s) => s.globalGoal)
  const setGhostSuggestions = useStore((s) => s.setGhostSuggestions)
  const setIsGenerating = useStore((s) => s.setIsGenerating)
  const setAiError = useStore((s) => s.setAiError)
  const isGenerating = useStore((s) => s.isGenerating)

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

      const steps = await generateNextSteps(
        ancestry,
        globalGoal,
        provider,
        apiKey,
        model,
        baseUrl,
        gradedNodes
      )

      console.log('[useGenerate] Steps received:', steps.length)
      steps.forEach((step, i) => {
        console.log(`[useGenerate] Step ${i}: type=${step.type}, citations=${step.citations?.length ?? 0}`)
        if (step.citations?.length) {
          console.log(`[useGenerate] Step ${i} citations:`, JSON.stringify(step.citations))
        }
      })

      const ghostNodes: GhostNode[] = steps.map((step, index) => {
        const ghostId = `ghost-${Date.now()}-${index}`

        return {
        id: ghostId,
        type: 'GHOST' as const,
        position: createRightwardSiblingPosition(parentNode.position, index),
        data: {
          summary_title: step.summary_title,
          text_content: step.text_content,
          suggestedType: step.type,
          parentId: nodeId,
          ghostId,
          citations: step.citations,
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

  return { generate, isGenerating }
}
