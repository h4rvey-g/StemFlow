import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { loadApiKeys } from '@/lib/api-keys'
import { validateChatResponse } from '@/lib/ai/chat-schemas'
import type { AiProvider } from '@/lib/ai/types'
import { AiError as AiErrorClass } from '@/lib/ai/types'
import { getThread, saveThread } from '@/lib/db/chat-db'
import { formatAncestryForPrompt, getNodeAncestry } from '@/lib/graph'
import { loadPromptSettings } from '@/lib/prompt-settings'
import { useChatStore } from '@/stores/useChatStore'
import { useStore } from '@/stores/useStore'
import type { ChatMessage, ProposalPayload } from '@/types/chat'

const DEFAULT_OPENAI_MODEL = 'gpt-4o'
const DEFAULT_ANTHROPIC_MODEL = 'claude-3-5-sonnet-20241022'
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-pro'
const MAX_MESSAGES_PER_THREAD = 50

const resolveProvider = (
  provider: string | null,
  keys: Awaited<ReturnType<typeof loadApiKeys>>
): AiProvider => {
  if (
    provider === 'openai' ||
    provider === 'openai-compatible' ||
    provider === 'anthropic' ||
    provider === 'gemini'
  ) {
    return provider
  }
  if (keys.openaiKey) return 'openai'
  if (keys.anthropicKey) return 'anthropic'
  if (keys.geminiKey) return 'gemini'
  return 'openai'
}

const toApiKey = (
  provider: AiProvider,
  keys: Awaited<ReturnType<typeof loadApiKeys>>
): string => {
  if (provider === 'openai' || provider === 'openai-compatible')
    return keys.openaiKey ?? ''
  if (provider === 'anthropic') return keys.anthropicKey ?? ''
  return keys.geminiKey ?? ''
}

const toModel = (
  provider: AiProvider,
  keys: Awaited<ReturnType<typeof loadApiKeys>>
): string => {
  if (provider === 'openai' || provider === 'openai-compatible')
    return keys.openaiModel ?? DEFAULT_OPENAI_MODEL
  if (provider === 'anthropic')
    return keys.anthropicModel ?? DEFAULT_ANTHROPIC_MODEL
  return keys.geminiModel ?? DEFAULT_GEMINI_MODEL
}

const truncateMessages = (messages: ChatMessage[]): ChatMessage[] => {
  if (messages.length <= MAX_MESSAGES_PER_THREAD) return messages
  return messages.slice(-MAX_MESSAGES_PER_THREAD)
}

interface UseNodeChatReturn {
  messages: ChatMessage[]
  isLoading: boolean
  error: string | null
  pendingProposal: {
    proposalId: string
    payload: ProposalPayload
  } | null
  sendMessage: (text: string) => Promise<void>
  acceptProposal: () => Promise<void>
  rejectProposal: () => void
  cancel: () => void
}

/**
 * Hook for per-node AI chat with proposal handling
 * @param nodeId - Node ID to chat about
 * @returns Chat state and actions
 */
export function useNodeChat(nodeId: string): UseNodeChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const nodeIdRef = useRef(nodeId)

  const pendingProposal = useChatStore((s) =>
    s.pendingProposal?.nodeId === nodeId ? s.pendingProposal : null
  )
  const setPendingProposal = useChatStore((s) => s.setPendingProposal)
  const clearPendingProposal = useChatStore((s) => s.clearPendingProposal)

  // Load thread on mount or node change
  useEffect(() => {
    nodeIdRef.current = nodeId

    const loadThread = async () => {
      try {
        const thread = await getThread(nodeId)
        if (thread && nodeIdRef.current === nodeId) {
          setMessages(truncateMessages(thread.messages))
        } else if (nodeIdRef.current === nodeId) {
          setMessages([])
        }
      } catch (caught) {
        if (nodeIdRef.current === nodeId) {
          const message =
            caught instanceof Error ? caught.message : 'Failed to load chat thread'
          setError(message)
        }
      }
    }

    void loadThread()

    return () => {
      const controller = abortRef.current
      if (controller) {
        controller.abort()
      }
    }
  }, [nodeId])

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmedText = text.trim()
      if (!trimmedText) return

      setIsLoading(true)
      setError(null)

      const userMessage: ChatMessage = {
        id: `msg-${Date.now()}-user`,
        nodeId,
        role: 'user',
        content: trimmedText,
        timestamp: Date.now(),
      }

      setMessages((curr) => truncateMessages([...curr, userMessage]))

      const controller = new AbortController()
      abortRef.current = controller

      try {
        const keys = await loadApiKeys()
        const provider = resolveProvider(keys.provider, keys)
        const apiKey = toApiKey(provider, keys)
        const model = toModel(provider, keys)

        if (!apiKey) {
          throw new AiErrorClass(
            'No API key found. Please configure settings.',
            provider
          )
        }

        const storeState = useStore.getState()
        const node = storeState.nodes.find((n) => n.id === nodeId)
        if (!node) {
          throw new Error('Node not found')
        }

        const ancestry = getNodeAncestry(nodeId, storeState.nodes, storeState.edges)
        const formattedAncestry = formatAncestryForPrompt(ancestry)
        const promptSettings = loadPromptSettings()

        const shouldStream = keys.aiStreamingEnabled === true

        const response = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider,
            apiKey,
            model,
            baseUrl: keys.openaiBaseUrl ?? undefined,
            nodeId,
            nodeType: node.type,
            message: trimmedText,
            nodeContent: node.data.text_content,
            ancestry: formattedAncestry,
            chatSystemPrompt: promptSettings.chatSystemPrompt,
            chatUserMessageTemplate: promptSettings.chatUserMessageTemplate,
            stream: shouldStream,
          }),
          signal: controller.signal,
        })

        if (!response.ok) {
          const errorData = (await response.json().catch(() => ({}))) as {
            error?: string
          }
          throw new Error(errorData.error || `Request failed: ${response.status}`)
        }

        const contentType = response.headers.get('content-type') || ''
        const isStream = contentType.includes('text/plain')

        let chatResponseText: string
        let assistantMessageId: string

        if (isStream && response.body) {
          // Streaming path
          assistantMessageId = `msg-${Date.now()}-assistant`
          let accumulatedText = ''

          // Create initial assistant message
          const initialAssistantMessage: ChatMessage = {
            id: assistantMessageId,
            nodeId,
            role: 'assistant',
            content: '',
            timestamp: Date.now(),
          }

          setMessages((curr) => truncateMessages([...curr, initialAssistantMessage]))

          const reader = response.body.getReader()
          const decoder = new TextDecoder()

          try {
            while (true) {
              const { value, done } = await reader.read()
              if (done) break
              if (value) {
                accumulatedText += decoder.decode(value, { stream: true })

                // Update message progressively
                setMessages((curr) =>
                  curr.map((msg) =>
                    msg.id === assistantMessageId
                      ? { ...msg, content: accumulatedText }
                      : msg
                  )
                )
              }
            }
            // Flush any remaining bytes
            accumulatedText += decoder.decode()
          } finally {
            reader.releaseLock()
          }

          chatResponseText = accumulatedText
        } else {
          // Non-streaming JSON path (fallback for tests or when streaming disabled)
          const json = (await response.json()) as unknown
          const validated = validateChatResponse(json)

          if (!validated.success) {
            throw new Error(
              validated.error?.message || 'Invalid response from AI'
            )
          }

          const chatResponse = validated.data

          if (!chatResponse) {
            throw new Error('No data in validated response')
          }

          const assistantMessage: ChatMessage = {
            id: `msg-${Date.now()}-assistant`,
            nodeId,
            role: 'assistant',
            content:
              chatResponse.mode === 'answer'
                ? chatResponse.answerText
                : chatResponse.proposal.content,
            timestamp: Date.now(),
            mode: chatResponse.mode,
          }

          if (chatResponse.mode === 'proposal') {
            const proposalId = `proposal-${Date.now()}`
            assistantMessage.proposalId = proposalId

            setPendingProposal({
              nodeId,
              proposalId,
              payload: chatResponse.proposal,
            })
          }

          const updatedMessages = truncateMessages([...messages, userMessage, assistantMessage])
          setMessages(updatedMessages)

          await saveThread({
            nodeId,
            messages: updatedMessages,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          })

          return
        }

        // Parse streamed text as JSON and validate
        let parsedJson: unknown
        try {
          parsedJson = JSON.parse(chatResponseText)
        } catch {
          throw new Error('Streamed response is not valid JSON')
        }

        const validated = validateChatResponse(parsedJson)

        if (!validated.success) {
          throw new Error(
            validated.error?.message || 'Invalid response from AI'
          )
        }

        const chatResponse = validated.data

        if (!chatResponse) {
          throw new Error('No data in validated response')
        }

        // Update final message with mode and proposal metadata
        const finalContent =
          chatResponse.mode === 'answer'
            ? chatResponse.answerText
            : chatResponse.proposal.content
        const proposalId = chatResponse.mode === 'proposal' ? `proposal-${Date.now()}` : undefined
        setMessages((curr) =>
          curr.map((msg) =>
            msg.id === assistantMessageId
              ? {
                  ...msg,
                  content: finalContent,
                  mode: chatResponse.mode,
                  proposalId,
                }
              : msg
          )
        )
        if (chatResponse.mode === 'proposal' && proposalId) {
          setPendingProposal({
            nodeId,
            proposalId,
            payload: chatResponse.proposal,
          })
        }

        // Save final thread
        const finalMessages = await new Promise<ChatMessage[]>((resolve) => {
          setMessages((curr) => {
            const truncated = truncateMessages(curr)
            resolve(truncated)
            return truncated
          })
        })

        await saveThread({
          nodeId,
          messages: finalMessages,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
      } catch (caught) {
        if (controller.signal.aborted) {
          return
        }

        const message =
          caught instanceof Error ? caught.message : 'Failed to send message'
        setError(message)
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null
        }
        setIsLoading(false)
      }
    },
    [nodeId, messages, setPendingProposal]
  )

  const acceptProposal = useCallback(async () => {
    if (!pendingProposal) return

    try {
      const { payload } = pendingProposal

      useStore.getState().updateNodeData(nodeId, {
        text_content: payload.content,
      })

      clearPendingProposal()

      const updatedMessages = truncateMessages(messages.map((msg) =>
        msg.proposalId === pendingProposal.proposalId
          ? { ...msg, mode: 'answer' as const }
          : msg
      ))
      setMessages(updatedMessages)

      await saveThread({
        nodeId,
        messages: updatedMessages,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : 'Failed to accept proposal'
      setError(message)
    }
  }, [nodeId, pendingProposal, messages, clearPendingProposal])

  const rejectProposal = useCallback(async () => {
    if (!pendingProposal) return
    try {
      clearPendingProposal()
      await saveThread({
        nodeId,
        messages: truncateMessages(messages),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : 'Failed to reject proposal'
      setError(message)
    }
  }, [nodeId, pendingProposal, messages, clearPendingProposal])

  const cancel = useCallback(() => {
    const controller = abortRef.current
    if (controller) {
      controller.abort()
    }
    setIsLoading(false)
  }, [])

  return useMemo(
    () => ({
      messages,
      isLoading,
      error,
      pendingProposal: pendingProposal
        ? {
            proposalId: pendingProposal.proposalId,
            payload: pendingProposal.payload,
          }
        : null,
      sendMessage,
      acceptProposal,
      rejectProposal,
      cancel,
    }),
    [
      messages,
      isLoading,
      error,
      pendingProposal,
      sendMessage,
      acceptProposal,
      rejectProposal,
      cancel,
    ]
  )
}
