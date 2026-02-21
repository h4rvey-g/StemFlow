import { useCallback, useMemo, useRef } from 'react'

import { loadApiKeys } from '@/lib/api-keys'
import { createRightwardPosition } from '@/lib/node-layout'
import { parseAnthropicStream, parseGeminiStream, parseOpenAIStream } from '@/lib/ai/stream-parser'
import type { AiAction, AiError, AiMessage, AiProvider } from '@/lib/ai/types'
import { AiError as AiErrorClass } from '@/lib/ai/types'
import { interpolatePromptTemplate, loadPromptSettings } from '@/lib/prompt-settings'
import { formatAncestryForPrompt, getNodeAncestry } from '@/lib/graph'
import { useAiStore } from '@/stores/useAiStore'
import { useStore, formatExperimentalConditionsForPrompt } from '@/stores/useStore'
import type { NodeType, OMVEdge, OMVNode } from '@/types/nodes'

const DEFAULT_OPENAI_MODEL = 'gpt-4o'
const DEFAULT_ANTHROPIC_MODEL = 'claude-3-5-sonnet-20241022'
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-pro'
const MAX_AI_REQUEST_ATTEMPTS = 3
const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504])

const toStatusCode = (code?: string): number | null => {
  if (!code) return null
  const parsed = Number(code)
  return Number.isFinite(parsed) ? parsed : null
}

const isRetryableError = (error: unknown): boolean => {
  if (error instanceof AiErrorClass) {
    const statusCode = toStatusCode(error.code)
    if (statusCode !== null) {
      if (statusCode >= 500) return true
      return RETRYABLE_STATUS_CODES.has(statusCode)
    }
  }

  return true
}

const getActionInstruction = (action: AiAction, sourceType: NodeType | null): string => {
  const promptSettings = loadPromptSettings()

  if (action === 'summarize') return promptSettings.useAiActionSummarizeInstruction
  if (action === 'suggest-mechanism') {
    if (sourceType === 'MECHANISM') {
      return promptSettings.useAiActionSuggestValidationFromMechanismInstruction
    }
    return promptSettings.useAiActionSuggestMechanismFromObservationInstruction
  }
  if (action === 'critique') return promptSettings.useAiActionCritiqueInstruction
  if (action === 'expand') return promptSettings.useAiActionExpandInstruction
  return promptSettings.useAiActionQuestionsInstruction
}

const resolveProvider = (provider: string | null, keys: Awaited<ReturnType<typeof loadApiKeys>>): AiProvider => {
  if (provider === 'openai' || provider === 'openai-compatible' || provider === 'anthropic' || provider === 'gemini') {
    return provider
  }
  if (keys.openaiKey) return 'openai'
  if (keys.anthropicKey) return 'anthropic'
  if (keys.geminiKey) return 'gemini'
  return 'openai'
}

const toApiKey = (provider: AiProvider, keys: Awaited<ReturnType<typeof loadApiKeys>>): string => {
  if (provider === 'openai' || provider === 'openai-compatible') return keys.openaiKey ?? ''
  if (provider === 'anthropic') return keys.anthropicKey ?? ''
  return keys.geminiKey ?? ''
}

const toModel = (provider: AiProvider, keys: Awaited<ReturnType<typeof loadApiKeys>>): string => {
  if (provider === 'openai' || provider === 'openai-compatible') return keys.openaiModel ?? DEFAULT_OPENAI_MODEL
  if (provider === 'anthropic') return keys.anthropicModel ?? DEFAULT_ANTHROPIC_MODEL
  return keys.geminiModel ?? DEFAULT_GEMINI_MODEL
}

const buildMessages = (
  context: string,
  action: AiAction,
  sourceType: NodeType | null,
  extraContext?: string
): AiMessage[] => {
  const promptSettings = loadPromptSettings()
  const instruction = getActionInstruction(action, sourceType)
  const conditions = formatExperimentalConditionsForPrompt(
    useStore.getState().experimentalConditions
  )
  const userContent = [context, extraContext?.trim(), conditions].filter(Boolean).join('\n\n')
  const userMessage = interpolatePromptTemplate(promptSettings.useAiUserMessageTemplate, {
    instruction,
    context: userContent,
  }).trim()

  return [
    {
      role: 'system',
      content: promptSettings.useAiSystemPrompt,
    },
    {
      role: 'user',
      content: userMessage,
    },
  ]
}

const getNodeById = (nodes: OMVNode[], nodeId: string): OMVNode | null =>
  nodes.find((node) => node.id === nodeId) ?? null

const createNodeFromResult = (sourceNode: OMVNode, action: AiAction, text: string): OMVNode => {
  const type =
    action === 'suggest-mechanism'
      ? sourceNode.type === 'MECHANISM'
        ? 'VALIDATION'
        : sourceNode.type === 'OBSERVATION'
          ? 'MECHANISM'
          : sourceNode.type
      : sourceNode.type
  const position = createRightwardPosition(sourceNode.position)

  return {
    id: `node-${Date.now()}`,
    type,
    data: { text_content: text },
    position,
  }
}

const createEdge = (sourceId: string, targetId: string): OMVEdge => ({
  id: `edge-${sourceId}-${targetId}`,
  source: sourceId,
  target: targetId,
})

export function useAi(nodeId: string) {
  const abortRef = useRef<AbortController | null>(null)

  const isLoading = useAiStore((s) => s.isLoading[nodeId] ?? false)
  const streamingText = useAiStore((s) => s.streamingText[nodeId] ?? '')
  const error = useAiStore((s) => s.error[nodeId] ?? null)
  const currentAction = useAiStore((s) => s.currentAction[nodeId] ?? null)

  const startStreaming = useAiStore((s) => s.startStreaming)
  const appendText = useAiStore((s) => s.appendText)
  const finishStreaming = useAiStore((s) => s.finishStreaming)
  const setError = useAiStore((s) => s.setError)

  const executeAction = useCallback(async (
    action: AiAction,
    context?: string,
    options?: { createNodeOnComplete?: boolean }
  ) => {
    const createNodeOnComplete = options?.createNodeOnComplete ?? true
    const keys = await loadApiKeys()
    const provider = resolveProvider(keys.provider, keys)
    const apiKey = toApiKey(provider, keys)
    const model = toModel(provider, keys)
    const aiStreamingEnabled = keys.aiStreamingEnabled ?? true

    if (!apiKey) {
      setError(nodeId, new AiErrorClass('No API key found. Please configure settings.', provider))
      return
    }

    const storeState = useStore.getState()
    const nodesSnapshot = storeState.nodes
    const edgesSnapshot = storeState.edges
    const sourceNode = getNodeById(nodesSnapshot, nodeId)
    const sourceType = sourceNode?.type ?? null
    const ancestry = getNodeAncestry(nodeId, nodesSnapshot, edgesSnapshot)
    const formatted = formatAncestryForPrompt(ancestry)
    const messages = buildMessages(formatted, action, sourceType, context)

    let lastError: unknown = null

    for (let attempt = 1; attempt <= MAX_AI_REQUEST_ATTEMPTS; attempt += 1) {
      startStreaming(nodeId, action)

      const controller = new AbortController()
      abortRef.current = controller

      let aggregated = ''

      try {
        const response = await fetch(`/api/ai/${provider}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            apiKey,
            model,
            messages,
            stream: aiStreamingEnabled,
            ...(provider === 'openai' || provider === 'openai-compatible'
              ? { baseUrl: keys.openaiBaseUrl ?? undefined }
              : {}),
          }),
          signal: controller.signal,
        })

        if (!response.ok) {
          throw new AiErrorClass('AI request failed', provider, String(response.status))
        }

        if (aiStreamingEnabled) {
          const reader = response.body?.getReader()
          if (!reader) {
            throw new AiErrorClass('AI stream unavailable', provider)
          }

          const parser =
            provider === 'gemini'
              ? parseGeminiStream
              : provider === 'anthropic'
                ? parseAnthropicStream
                : parseOpenAIStream

          for await (const chunk of parser(reader)) {
            if (chunk.done) break
            aggregated += chunk.text
            appendText(nodeId, chunk.text)
          }
        } else {
          const json = (await response.json()) as { text?: string }
          const text = typeof json.text === 'string' ? json.text : ''
          if (text) {
            aggregated = text
            appendText(nodeId, text)
          }
        }

        finishStreaming(nodeId)

        const finalText = aggregated.trim()
        if (!finalText) return
        if (!createNodeOnComplete) return

        if (!sourceNode) return

        const newNode = createNodeFromResult(sourceNode, action, finalText)
        useStore.getState().addNode(newNode)
        useStore.getState().addEdge(createEdge(nodeId, newNode.id))
        return
      } catch (caught) {
        if (controller.signal.aborted) {
          finishStreaming(nodeId)
          return
        }

        lastError = caught
        const shouldRetry = attempt < MAX_AI_REQUEST_ATTEMPTS && isRetryableError(caught)
        if (shouldRetry) {
          continue
        }
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null
        }
      }
    }

    const message = lastError instanceof Error ? lastError.message : 'AI request failed'
    const aiError: AiError =
      lastError instanceof AiErrorClass ? lastError : new AiErrorClass(message, provider)
    setError(nodeId, aiError)
  }, [appendText, finishStreaming, nodeId, setError, startStreaming])

  const cancel = useCallback(() => {
    const controller = abortRef.current
    if (controller) {
      controller.abort()
    }
    finishStreaming(nodeId)
  }, [finishStreaming, nodeId])

  return useMemo(() => ({
    isLoading,
    streamingText,
    error,
    currentAction,
    executeAction,
    cancel,
  }), [cancel, currentAction, error, executeAction, isLoading, streamingText])
}
