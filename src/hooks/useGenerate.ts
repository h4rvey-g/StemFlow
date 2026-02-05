import { useCallback } from 'react'
import { useStore } from '@/stores/useStore'
import { loadApiKeys } from '@/lib/api-keys'
import { generateNextSteps } from '@/lib/ai-service'
import { getNodeAncestry } from '@/lib/graph'
import type { GhostNode } from '@/types/nodes'

export function useGenerate() {
  const nodes = useStore((s) => s.nodes)
  const edges = useStore((s) => s.edges)
  const globalGoal = useStore((s) => s.globalGoal)
  const setGhostNodes = useStore((s) => s.setGhostNodes)
  const setIsGenerating = useStore((s) => s.setIsGenerating)
  const setAiError = useStore((s) => s.setAiError)
  const isGenerating = useStore((s) => s.isGenerating)

  const generate = useCallback(async (nodeId: string) => {
    setIsGenerating(true)
    setAiError(null)

    try {
      const { provider, openaiKey, anthropicKey, openaiModel, anthropicModel, openaiBaseUrl, anthropicBaseUrl } = await loadApiKeys()
      const apiKey = provider === 'openai' || provider === 'openai-compatible' ? openaiKey : anthropicKey
      const model = provider === 'openai' || provider === 'openai-compatible' ? openaiModel : anthropicModel
      const baseUrl = provider === 'openai' || provider === 'openai-compatible' ? openaiBaseUrl : anthropicBaseUrl

      if (!provider || !apiKey) {
        throw new Error('No API key found. Please configure settings.')
      }

      const ancestry = getNodeAncestry(nodeId, nodes, edges)
      const parentNode = nodes.find((n) => n.id === nodeId)

      if (!parentNode) {
        throw new Error('Node not found')
      }

      const steps = await generateNextSteps(ancestry, globalGoal, provider, apiKey, model, baseUrl)

      const ghostNodes: GhostNode[] = steps.map((step, index) => ({
        id: `ghost-${Date.now()}-${index}`,
        type: 'GHOST' as const,
        position: {
          x: parentNode.position.x + (index * 220),
          y: parentNode.position.y + 250,
        },
        data: {
          text_content: step.text_content,
          suggestedType: step.type,
          parentId: nodeId,
          ghostId: `ghost-${Date.now()}-${index}`,
        },
      }))

      console.log('[useGenerate] Created ghost nodes:', ghostNodes)
      setGhostNodes(ghostNodes)
      console.log('[useGenerate] Ghost nodes set in store')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error occurred'
      setAiError(message)
    } finally {
      setIsGenerating(false)
    }
  }, [nodes, edges, globalGoal, setGhostNodes, setIsGenerating, setAiError])

  return { generate, isGenerating }
}
