import { useCallback, useMemo, useRef } from 'react'

import { loadApiKeys } from '@/lib/api-keys'
import { createRightwardPosition } from '@/lib/node-layout'
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

const toFastModel = (provider: AiProvider, keys: Awaited<ReturnType<typeof loadApiKeys>>): string => {
  if (provider === 'openai' || provider === 'openai-compatible') {
    return keys.openaiFastModel ?? keys.openaiModel ?? DEFAULT_OPENAI_MODEL
  }
  if (provider === 'anthropic') {
    return keys.anthropicFastModel ?? keys.anthropicModel ?? DEFAULT_ANTHROPIC_MODEL
  }
  return keys.geminiFastModel ?? keys.geminiModel ?? DEFAULT_GEMINI_MODEL
}


const requestAiText = async (
  params: {
    provider: AiProvider
    apiKey: string
    model: string
    messages: AiMessage[]
    stream: boolean
    openaiBaseUrl?: string | null
  },
  onChunk: (text: string) => void,
  signal: AbortSignal
): Promise<string> => {
  const { provider, apiKey, model, messages, stream, openaiBaseUrl } = params

  const response = await fetch(`/api/ai/${provider}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apiKey,
      model,
      messages,
      stream,
      ...(provider === 'openai' || provider === 'openai-compatible'
        ? { baseUrl: openaiBaseUrl ?? undefined }
        : {}),
    }),
    signal,
  })

  if (!response.ok) {
    throw new AiErrorClass('AI request failed', provider, String(response.status))
  }

  let aggregated = ''

  if (stream) {
    const reader = response.body?.getReader()
    if (!reader) {
      throw new AiErrorClass('AI stream unavailable', provider)
    }

    const decoder = new TextDecoder()
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      if (value) {
        const text = decoder.decode(value, { stream: true })
        aggregated += text
        onChunk(text)
      }
    }
  } else {
    const json = (await response.json()) as { text?: string }
    const text = typeof json.text === 'string' ? json.text : ''
    if (text) {
      aggregated = text
      onChunk(text)
    }
  }

  return aggregated
}

type TranslationLanguage = 'zh-CN' | 'en'

type TranslationResult = {
  translatedTitle: string
  translatedContent: string
}

const tryParseTranslationJson = (candidate: string): TranslationResult | null => {
  try {
    const parsed = JSON.parse(candidate) as {
      translatedTitle?: unknown
      translatedContent?: unknown
    }
    return {
      translatedTitle: typeof parsed.translatedTitle === 'string' ? parsed.translatedTitle.trim() : '',
      translatedContent: typeof parsed.translatedContent === 'string' ? parsed.translatedContent.trim() : '',
    }
  } catch {
    return null
  }
}

const parseTranslationResult = (rawText: string): TranslationResult => {
  const trimmed = rawText.trim()
  if (!trimmed) {
    return { translatedTitle: '', translatedContent: '' }
  }

  const fencedContent = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1]
  const candidates = [trimmed, fencedContent].filter((value): value is string => Boolean(value))

  for (const candidate of candidates) {
    const direct = tryParseTranslationJson(candidate)
    if (direct) {
      return direct
    }

    const firstBraceIndex = candidate.indexOf('{')
    const lastBraceIndex = candidate.lastIndexOf('}')
    if (firstBraceIndex >= 0 && lastBraceIndex > firstBraceIndex) {
      const objectSlice = candidate.slice(firstBraceIndex, lastBraceIndex + 1)
      const sliced = tryParseTranslationJson(objectSlice)
      if (sliced) {
        return sliced
      }
    }
  }

  return {
    translatedTitle: '',
    translatedContent: trimmed,
  }
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
        aggregated = await requestAiText(
          {
            provider,
            apiKey,
            model,
            messages,
            stream: aiStreamingEnabled,
            openaiBaseUrl: keys.openaiBaseUrl,
          },
          (text) => {
            appendText(nodeId, text)
          },
          controller.signal
        )

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

  const translateNodeContent = useCallback(async (language: TranslationLanguage) => {
    const keys = await loadApiKeys()
    const provider = resolveProvider(keys.provider, keys)
    const apiKey = toApiKey(provider, keys)
    const model = toFastModel(provider, keys)
    const aiStreamingEnabled = keys.aiStreamingEnabled ?? true

    if (!apiKey) {
      setError(nodeId, new AiErrorClass('No API key found. Please configure settings.', provider))
      return
    }

    const sourceNode = getNodeById(useStore.getState().nodes, nodeId)
    if (!sourceNode) {
      setError(nodeId, new AiErrorClass('Source node not found.', provider))
      return
    }

    const sourceTitle = sourceNode.data.summary_title?.trim() ?? ''
    const sourceContent = sourceNode.data.text_content.trim()
    if (!sourceTitle && !sourceContent) {
      setError(nodeId, new AiErrorClass('Nothing to translate for this node.', provider))
      return
    }

    const targetLanguageName = language === 'zh-CN' ? 'Simplified Chinese' : 'English'
    const messages: AiMessage[] = [
      {
        role: 'system',
        content:
          'You are a precise translator. Return valid JSON only, with keys translatedTitle and translatedContent. Do not include markdown fences or extra keys.',
      },
      {
        role: 'user',
        content: [
          `Translate the following node title and content into ${targetLanguageName}.`,
          'Preserve scientific meaning and avoid adding or removing facts.',
          '',
          `Title: ${sourceTitle || '(empty)'}`,
          `Content: ${sourceContent || '(empty)'}`,
          '',
          'Output JSON format:',
          '{"translatedTitle":"...","translatedContent":"..."}',
        ].join('\n'),
      },
    ]

    let lastError: unknown = null

    for (let attempt = 1; attempt <= MAX_AI_REQUEST_ATTEMPTS; attempt += 1) {
      startStreaming(nodeId, 'translation')

      const controller = new AbortController()
      abortRef.current = controller

      let aggregated = ''

      try {
        aggregated = await requestAiText(
          {
            provider,
            apiKey,
            model,
            messages,
            stream: aiStreamingEnabled,
            openaiBaseUrl: keys.openaiBaseUrl,
          },
          (text) => {
            appendText(nodeId, text)
          },
          controller.signal
        )

        finishStreaming(nodeId)

        const parsed = parseTranslationResult(aggregated)
        const translatedContent = parsed.translatedContent || aggregated.trim()

        useStore.getState().updateNodeData(nodeId, {
          translated_language: language,
          translated_title: parsed.translatedTitle,
          translated_text_content: translatedContent,
        })
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
    translateNodeContent,
    cancel,
  }), [cancel, currentAction, error, executeAction, isLoading, streamingText, translateNodeContent])
}
