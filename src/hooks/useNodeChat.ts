import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { generateId } from '@/lib/uuid'
import { loadApiKeys } from '@/lib/api-keys'
import { validateChatResponse } from '@/lib/ai/chat-schemas'
import type { AiProvider } from '@/lib/ai/types'
import { AiError as AiErrorClass } from '@/lib/ai/types'
import {
  appendTurn,
  appendVariant,
  createThreadV2,
  getActiveThreadId,
  listThreadsV2,
  listTurnsWithVariants,
  setActiveThreadId,
  setProposalStatus,
  setSelectedVariant as setSelectedVariantInDb,
  updateVariant,
  updateThreadTitle,
} from '@/lib/db/chat-db'
import { formatAncestryForPrompt, getNodeAncestry } from '@/lib/graph'
import { loadPromptSettings } from '@/lib/prompt-settings'
import { useStore } from '@/stores/useStore'
import type { ChatMessage, ProposalPayload, ChatResponse } from '@/types/chat'

const DEFAULT_OPENAI_MODEL = 'gpt-4o'
const DEFAULT_ANTHROPIC_MODEL = 'claude-3-5-sonnet-20241022'
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-pro'
const HISTORY_TURN_LIMIT = 12
const HISTORY_CONTENT_LIMIT = 5000
const STREAM_PERSIST_MS = 750

type VariantStatus = 'streaming' | 'complete' | 'error' | 'aborted'
type VariantMode = 'answer' | 'proposal'
type ProposalStatus = 'pending' | 'accepted' | 'rejected'

interface HookVariant {
  variantId: string
  ordinal: number
  status: VariantStatus
  mode: VariantMode
  contentText: string
  proposal?: ProposalPayload
  proposalStatus?: ProposalStatus
}

interface HookTurn {
  turnId: string
  seq: number
  userText: string
  userCreatedAt: number
  selectedVariantOrdinal: number | null
  variants: HookVariant[]
  viewingVariantOrdinal: number | null
}

interface HookThread {
  id: string
  title: string
  updatedAt: number
}

interface AcceptRejectArgs {
  variantId: string
}

interface SetSelectedVariantArgs {
  threadId: string
  turnId: string
  ordinal: number
}

interface SetViewingVariantArgs {
  threadId: string
  turnId: string
  ordinal: number
}

interface RegenerateVariantArgs {
  threadId: string
  turnId: string
  fromVariantId?: string
}

interface UseNodeChatReturn {
  threads: HookThread[]
  activeThreadId: string
  setActiveThread: (threadId: string) => Promise<void>
  startNewThread: () => Promise<string>
  turns: HookTurn[]
  sendMessage: (text: string) => Promise<void>
  regenerateVariant: (args: RegenerateVariantArgs) => Promise<void>
  setViewingVariant: (args: SetViewingVariantArgs) => void
  setSelectedVariant: (args: SetSelectedVariantArgs) => Promise<void>
  acceptProposal: (args?: AcceptRejectArgs) => Promise<void>
  rejectProposal: (args?: AcceptRejectArgs) => Promise<void>
  cancel: () => void
  isLoading: boolean
  error: string | null
  messages: ChatMessage[]
  pendingProposal: {
    proposalId: string
    payload: ProposalPayload
  } | null
}

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
  if (provider === 'openai' || provider === 'openai-compatible') return keys.openaiKey ?? ''
  if (provider === 'anthropic') return keys.anthropicKey ?? ''
  return keys.geminiKey ?? ''
}

const toModel = (
  provider: AiProvider,
  keys: Awaited<ReturnType<typeof loadApiKeys>>
): string => {
  if (provider === 'openai' || provider === 'openai-compatible') {
    return keys.openaiModel ?? DEFAULT_OPENAI_MODEL
  }
  if (provider === 'anthropic') return keys.anthropicModel ?? DEFAULT_ANTHROPIC_MODEL
  return keys.geminiModel ?? DEFAULT_GEMINI_MODEL
}

const truncateToHistoryLimit = (value: string): string => {
  if (value.length <= HISTORY_CONTENT_LIMIT) return value
  return value.slice(0, HISTORY_CONTENT_LIMIT)
}

const parseStreamChunk = (line: string): Partial<ChatResponse> | null => {
  const trimmed = line.trim()
  if (!trimmed) return null

  const payload = trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed
  if (!payload || payload === '[DONE]') return null

  try {
    const parsed = JSON.parse(payload)
    if (!parsed || typeof parsed !== 'object') return null
    return parsed as Partial<ChatResponse>
  } catch {
    return null
  }
}

type StreamChatResponse = {
  mode?: 'answer' | 'proposal'
  answerText?: string
  proposal?: Partial<ProposalPayload>
}

const mergeChatResponse = (
  previous: StreamChatResponse,
  incoming: StreamChatResponse
): StreamChatResponse => {
  const merged: StreamChatResponse = { ...previous, ...incoming }

  if (previous.proposal || incoming.proposal) {
    merged.proposal = {
      ...(previous.proposal ?? {}),
      ...(incoming.proposal ?? {}),
    }
  }

  return merged
}

const formatVariantForHistory = (variant: HookVariant): string => {
  if (variant.mode === 'answer') {
    return truncateToHistoryLimit(variant.contentText)
  }

  const proposal = variant.proposal
  if (!proposal) return truncateToHistoryLimit(variant.contentText)

  return truncateToHistoryLimit(
    [
      'Proposal',
      `Title: ${proposal.title}`,
      `Rationale: ${proposal.rationale}`,
      `Content: ${proposal.content}`,
      `DiffSummary: ${proposal.diffSummary ?? ''}`,
    ].join('\n')
  )
}

const toHookTurns = (source: Awaited<ReturnType<typeof listTurnsWithVariants>>): HookTurn[] =>
  source.map(({ turn, variants }) => ({
    turnId: turn.id,
    seq: turn.seq,
    userText: turn.userText,
    userCreatedAt: turn.userCreatedAt,
    selectedVariantOrdinal: turn.selectedVariantOrdinal,
    viewingVariantOrdinal: null,
    variants: variants.map((variant) => ({
      variantId: variant.id,
      ordinal: variant.ordinal,
      status: variant.status,
      mode: variant.mode,
      contentText: variant.contentText,
      proposal: variant.proposal,
      proposalStatus: variant.proposalStatus,
    })),
  }))

const findSelectedVariant = (turn: HookTurn): HookVariant | null => {
  if (turn.selectedVariantOrdinal === null) return null
  return turn.variants.find((variant) => variant.ordinal === turn.selectedVariantOrdinal) ?? null
}

const buildHistory = (turns: HookTurn[]) => {
  const history: Array<{ role: 'user' | 'assistant'; content: string }> = []
  const limitedTurns = turns.slice(-HISTORY_TURN_LIMIT)

  for (const turn of limitedTurns) {
    history.push({ role: 'user', content: truncateToHistoryLimit(turn.userText) })
    const selectedVariant = findSelectedVariant(turn)
    if (selectedVariant) {
      history.push({
        role: 'assistant',
        content: formatVariantForHistory(selectedVariant),
      })
    }
  }

  return history
}

const deriveLegacyMessages = (nodeId: string, turns: HookTurn[]): ChatMessage[] => {
  const messages: ChatMessage[] = []

  for (const turn of turns) {
    messages.push({
      id: `user-${turn.turnId}`,
      nodeId,
      role: 'user',
      content: turn.userText,
      timestamp: turn.userCreatedAt,
    })

    const viewingVariant =
      turn.viewingVariantOrdinal === null
        ? null
        : turn.variants.find((variant) => variant.ordinal === turn.viewingVariantOrdinal) ?? null
    const selectedVariant = findSelectedVariant(turn)
    const latestVariant = turn.variants.at(-1) ?? null
    const shownVariant = viewingVariant ?? selectedVariant ?? latestVariant

    if (shownVariant && shownVariant.contentText.trim()) {
      messages.push({
        id: shownVariant.variantId,
        nodeId,
        role: 'assistant',
        content: shownVariant.contentText,
        timestamp: Date.now(),
        mode: shownVariant.mode,
        proposalId: shownVariant.mode === 'proposal' ? shownVariant.variantId : undefined,
      })
    }
  }

  return messages
}

export function useNodeChat(nodeId: string): UseNodeChatReturn {
  const [threads, setThreads] = useState<HookThread[]>([])
  const [activeThreadId, setActiveThreadIdState] = useState('')
  const [turns, setTurns] = useState<HookTurn[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nodeIdRef = useRef(nodeId)
  const abortRef = useRef<AbortController | null>(null)
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const refreshThreads = useCallback(async () => {
    const fetched = await listThreadsV2(nodeId)
    setThreads(
      fetched.map((thread) => ({
        id: thread.id,
        title: thread.title,
        updatedAt: thread.updatedAt,
      }))
    )
    return fetched
  }, [nodeId])

  const loadThreadTurns = useCallback(
    async (threadId: string) => {
      const data = await listTurnsWithVariants(threadId)
      setTurns(toHookTurns(data))
    },
    []
  )

  useEffect(() => {
    nodeIdRef.current = nodeId

    const run = async () => {
      console.log('[useNodeChat] Loading effect running for nodeId:', nodeId)
      try {
        const fetchedThreads = await refreshThreads()

        const storedActiveThreadId = await getActiveThreadId(nodeId)
        const availableThreadId =
          storedActiveThreadId && fetchedThreads.some((thread) => thread.id === storedActiveThreadId)
            ? storedActiveThreadId
            : fetchedThreads[0]?.id ?? ''

        console.log('[useNodeChat] Available thread ID:', availableThreadId)
        setActiveThreadIdState(availableThreadId)

        if (availableThreadId) {
          await setActiveThreadId(nodeId, availableThreadId)
          if (nodeIdRef.current === nodeId) {
            await loadThreadTurns(availableThreadId)
          }
        } else {
          console.log('[useNodeChat] No available thread, setting empty turns')
          setTurns([])
        }
      } catch (caught) {
        if (nodeIdRef.current !== nodeId) return
        setError(caught instanceof Error ? caught.message : 'Failed to load chat')
      }
    }

    void run()

  }, [loadThreadTurns, nodeId, refreshThreads])

  const ensureActiveThread = useCallback(async (): Promise<string> => {
    if (activeThreadId) return activeThreadId

    const created = await createThreadV2(nodeId)
    await setActiveThreadId(nodeId, created.id)
    setActiveThreadIdState(created.id)
    await refreshThreads()
    setTurns([])
    return created.id
  }, [activeThreadId, nodeId, refreshThreads])

  const patchVariantInState = useCallback(
    (turnId: string, variantId: string, patch: Partial<HookVariant>) => {
      setTurns((current) =>
        current.map((turn) => {
          if (turn.turnId !== turnId) return turn
          return {
            ...turn,
            variants: turn.variants.map((variant) =>
              variant.variantId === variantId ? { ...variant, ...patch } : variant
            ),
          }
        })
      )
    },
    []
  )

  const executeGeneration = useCallback(
    async (args: {
      threadId: string
      turnId: string
      variantId: string
      variantOrdinal: number
      selectForContext: boolean
      message: string
      history: Array<{ role: 'user' | 'assistant'; content: string }>
    }) => {
      const generationId = generateId()
      const controller = new AbortController()
      abortRef.current = controller
      if (isMountedRef.current) {
        setIsLoading(true)
        setError(null)
      }

      let latestChatResponse: StreamChatResponse = {}
      let latestContent = ''
      let lastPersistedAt = 0

      const persistPartial = async (force = false) => {
        const now = Date.now()
        if (!force && now - lastPersistedAt < STREAM_PERSIST_MS) {
          return
        }
        await updateVariant(args.variantId, { contentText: latestContent })
        lastPersistedAt = now
      }

      try {
        const keys = await loadApiKeys()
        const provider = resolveProvider(keys.provider, keys)
        const apiKey = toApiKey(provider, keys)
        const model = toModel(provider, keys)

        if (!apiKey) {
          throw new AiErrorClass('No API key found. Please configure settings.', provider)
        }

        const storeState = useStore.getState()
        const node = storeState.nodes.find((item) => item.id === nodeId)
        if (!node) throw new Error('Node not found')

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
            message: args.message,
            nodeContent: node.data.text_content,
            ancestry: formattedAncestry,
            history: args.history,
            chatSystemPrompt: promptSettings.chatSystemPrompt,
            chatUserMessageTemplate: promptSettings.chatUserMessageTemplate,
            stream: shouldStream,
            generationId,
          }),
          signal: controller.signal,
        })

        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { error?: string }
          throw new Error(payload.error || `Request failed: ${response.status}`)
        }

        const isStream = (response.headers.get('content-type') || '').includes('text/plain')

        if (isStream && response.body) {
          const reader = response.body.getReader()
          const decoder = new TextDecoder()
          let buffer = ''

          try {
            while (true) {
              const { value, done } = await reader.read()
              if (done) break
              if (!value) continue

              buffer += decoder.decode(value, { stream: true })
              const lines = buffer.split('\n')
              buffer = lines[lines.length - 1] ?? ''

              for (let index = 0; index < lines.length - 1; index += 1) {
                const line = lines[index]?.trim()
                if (!line) continue

                const chunk = parseStreamChunk(line) as StreamChatResponse | null
                if (!chunk) continue

                latestChatResponse = mergeChatResponse(latestChatResponse, chunk)
                if (latestChatResponse.mode === 'answer' && typeof latestChatResponse.answerText === 'string') {
                  latestContent = latestChatResponse.answerText
                } else if (
                  latestChatResponse.mode === 'proposal' &&
                  typeof latestChatResponse.proposal?.content === 'string'
                ) {
                  latestContent = latestChatResponse.proposal.content
                }

                const variantPatch: Partial<HookVariant> = {
                  contentText: latestContent,
                }
                if (latestChatResponse.mode === 'proposal' || latestChatResponse.mode === 'answer') {
                  variantPatch.mode = latestChatResponse.mode
                }

                if (isMountedRef.current) {
                  patchVariantInState(args.turnId, args.variantId, variantPatch)
                }
                await persistPartial(false)
              }
            }

            buffer += decoder.decode()
            if (buffer.trim()) {
              const chunk = parseStreamChunk(buffer) as StreamChatResponse | null
              if (chunk) {
                latestChatResponse = mergeChatResponse(latestChatResponse, chunk)
              }
            }
          } finally {
            reader.releaseLock()
          }
        } else {
          latestChatResponse = (await response.json()) as StreamChatResponse
          if (latestChatResponse.mode === 'answer' && typeof latestChatResponse.answerText === 'string') {
            latestContent = latestChatResponse.answerText
          } else if (
            latestChatResponse.mode === 'proposal' &&
            typeof latestChatResponse.proposal?.content === 'string'
          ) {
            latestContent = latestChatResponse.proposal.content
          }
          if (isMountedRef.current) {
            patchVariantInState(args.turnId, args.variantId, { contentText: latestContent })
          }
        }

        const validated = validateChatResponse(latestChatResponse)

        // DEBUG: Log AI response to trace empty content issue
        console.log('🤖 [AI Response]', {
          raw: latestChatResponse,
          validated: validated.success,
          mode: validated.data?.mode,
          answerText: validated.data?.mode === 'answer' ? validated.data.answerText : null,
          answerLength: validated.data?.mode === 'answer' ? (validated.data.answerText?.length || 0) : 0,
          proposalContent: validated.data?.mode === 'proposal' ? validated.data.proposal?.content : null,
          proposalLength: validated.data?.mode === 'proposal' ? (validated.data.proposal?.content?.length || 0) : 0,
        })
        if (!validated.success || !validated.data) {
          throw new Error(validated.error?.message || 'Invalid response from AI')
        }

        const responseData = validated.data
        const finalMode = responseData.mode
        const finalContent =
          finalMode === 'answer' ? responseData.answerText : responseData.proposal.content

        if (isMountedRef.current) {
          patchVariantInState(args.turnId, args.variantId, {
            mode: finalMode,
            status: 'complete',
            contentText: finalContent,
            proposal: finalMode === 'proposal' ? responseData.proposal : undefined,
            proposalStatus: finalMode === 'proposal' ? 'pending' : undefined,
          })
        }

        // DEBUG: Log before persisting to DB
        console.log('💾 [Before updateVariant]', {
          variantId: args.variantId,
          status: 'complete',
          contentLength: finalContent?.length || 0,
          contentPreview: finalContent?.substring(0, 100) || '(empty)',
        })

        await updateVariant(args.variantId, {
          status: 'complete',
          contentText: finalContent,
          proposal: finalMode === 'proposal' ? responseData.proposal : undefined,
          proposalStatus: finalMode === 'proposal' ? 'pending' : undefined,
        })

        if (args.selectForContext) {
          await setSelectedVariantInDb(args.turnId, args.variantOrdinal)
          setTurns((current) =>
            current.map((turn) =>
              turn.turnId === args.turnId
                ? { ...turn, selectedVariantOrdinal: args.variantOrdinal }
                : turn
            )
          )
        }
      } catch (caught) {
        if (controller.signal.aborted) {
          await updateVariant(args.variantId, {
            status: 'aborted',
            contentText: latestContent,
          })
          if (isMountedRef.current) {
            patchVariantInState(args.turnId, args.variantId, {
              status: 'aborted',
              contentText: latestContent,
            })
          }
          return
        }

        await updateVariant(args.variantId, {
          status: 'error',
          contentText: latestContent,
        })
        if (isMountedRef.current) {
          patchVariantInState(args.turnId, args.variantId, {
            status: 'error',
            contentText: latestContent,
          })
        }

        if (isMountedRef.current) {
          setError(caught instanceof Error ? caught.message : 'Failed to send message')
        }
      } finally {
        // Only persist partial content if we didn't already persist final content
        // (i.e., if we aborted or errored before reaching the success block)
        if (controller.signal.aborted || latestChatResponse === null) {
          await persistPartial(true)
        }
        if (abortRef.current === controller) {
          abortRef.current = null
        }
        if (isMountedRef.current) {
          setIsLoading(false)
        }
        await refreshThreads()
      }
    },
    [nodeId, patchVariantInState, refreshThreads]
  )

  const setActiveThread = useCallback(
    async (threadId: string) => {
      if (!threadId) return
      await setActiveThreadId(nodeId, threadId)
      setActiveThreadIdState(threadId)
      await loadThreadTurns(threadId)
    },
    [loadThreadTurns, nodeId]
  )

  const startNewThread = useCallback(async () => {
    const created = await createThreadV2(nodeId)
    await setActiveThreadId(nodeId, created.id)
    setActiveThreadIdState(created.id)
    setTurns([])
    await refreshThreads()
    return created.id
  }, [nodeId, refreshThreads])

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed) return

      const threadId = await ensureActiveThread()
      const priorTurns = turns
      const history = buildHistory(priorTurns)

      const newTurn = await appendTurn(threadId, trimmed)

      setTurns((current) => [
        ...current,
        {
          turnId: newTurn.id,
          seq: newTurn.seq,
          userText: newTurn.userText,
          userCreatedAt: newTurn.userCreatedAt,
          selectedVariantOrdinal: null,
          viewingVariantOrdinal: null,
          variants: [],
        },
      ])

      if (newTurn.seq === 0) {
        const title = trimmed.slice(0, 32).trim()
        if (title) {
          await updateThreadTitle(threadId, title)
        }
      }

      const assistantVariant = await appendVariant(newTurn.id, {
        status: 'streaming',
        mode: 'answer',
        contentText: '',
      })

      setTurns((current) =>
        current.map((turn) =>
          turn.turnId === newTurn.id
            ? {
                ...turn,
                selectedVariantOrdinal: assistantVariant.ordinal,
                viewingVariantOrdinal: assistantVariant.ordinal,
                variants: [
                  ...turn.variants,
                  {
                    variantId: assistantVariant.id,
                    ordinal: assistantVariant.ordinal,
                    status: assistantVariant.status,
                    mode: assistantVariant.mode,
                    contentText: assistantVariant.contentText,
                    proposal: assistantVariant.proposal,
                    proposalStatus: assistantVariant.proposalStatus,
                  },
                ],
              }
            : turn
        )
      )

      await executeGeneration({
        threadId,
        turnId: newTurn.id,
        variantId: assistantVariant.id,
        variantOrdinal: assistantVariant.ordinal,
        selectForContext: true,
        message: trimmed,
        history,
      })
    },
    [ensureActiveThread, executeGeneration, turns]
  )

  const regenerateVariant = useCallback(
    async ({ threadId, turnId }: RegenerateVariantArgs) => {
      let targetTurns = turns
      if (threadId !== activeThreadId) {
        const loaded = await listTurnsWithVariants(threadId)
        targetTurns = toHookTurns(loaded)
      }

      const targetTurn = targetTurns.find((turn) => turn.turnId === turnId)
      if (!targetTurn) {
        setError('Target turn not found')
        return
      }

      const history = buildHistory(targetTurns.filter((turn) => turn.seq < targetTurn.seq))
      const variant = await appendVariant(turnId, {
        status: 'streaming',
        mode: 'answer',
        contentText: '',
      })

      if (threadId === activeThreadId) {
        setTurns((current) =>
          current.map((turn) =>
            turn.turnId === turnId
              ? {
                  ...turn,
                  viewingVariantOrdinal: variant.ordinal,
                  variants: [
                    ...turn.variants,
                    {
                      variantId: variant.id,
                      ordinal: variant.ordinal,
                      status: variant.status,
                      mode: variant.mode,
                      contentText: variant.contentText,
                      proposal: variant.proposal,
                      proposalStatus: variant.proposalStatus,
                    },
                  ],
                }
              : turn
          )
        )
      }

      await executeGeneration({
        threadId,
        turnId,
        variantId: variant.id,
        variantOrdinal: variant.ordinal,
        selectForContext: false,
        message: targetTurn.userText,
        history,
      })
    },
    [activeThreadId, executeGeneration, turns]
  )

  const setSelectedVariant = useCallback(async ({ threadId, turnId, ordinal }: SetSelectedVariantArgs) => {
    if (threadId !== activeThreadId) return
    await setSelectedVariantInDb(turnId, ordinal)
    setTurns((current) =>
      current.map((turn) =>
        turn.turnId === turnId
          ? {
              ...turn,
              selectedVariantOrdinal: ordinal,
              viewingVariantOrdinal: ordinal,
            }
          : turn
      )
    )
  }, [activeThreadId])

  const setViewingVariant = useCallback(({ threadId, turnId, ordinal }: SetViewingVariantArgs) => {
    if (threadId !== activeThreadId) return
    setTurns((current) =>
      current.map((turn) =>
        turn.turnId === turnId
          ? {
              ...turn,
              viewingVariantOrdinal: ordinal,
            }
          : turn
      )
    )
  }, [activeThreadId])

  const findPendingProposal = useCallback(() => {
    for (let turnIndex = turns.length - 1; turnIndex >= 0; turnIndex -= 1) {
      const turn = turns[turnIndex]
      for (let variantIndex = turn.variants.length - 1; variantIndex >= 0; variantIndex -= 1) {
        const variant = turn.variants[variantIndex]
        if (
          variant.mode === 'proposal' &&
          variant.proposal &&
          (variant.proposalStatus === undefined || variant.proposalStatus === 'pending')
        ) {
          return {
            proposalId: variant.variantId,
            payload: variant.proposal,
          }
        }
      }
    }
    return null
  }, [turns])

  const acceptProposal = useCallback(
    async (args?: AcceptRejectArgs) => {
      const pending = findPendingProposal()
      const variantId = args?.variantId ?? pending?.proposalId
      if (!variantId) return

      let appliedContent: string | null = null

      setTurns((current) =>
        current.map((turn) => ({
          ...turn,
          variants: turn.variants.map((variant) => {
            if (variant.variantId !== variantId) return variant
            if (variant.proposal?.content) {
              appliedContent = variant.proposal.content
            }
            return { ...variant, proposalStatus: 'accepted' }
          }),
        }))
      )

      await setProposalStatus(variantId, 'accepted')

      if (appliedContent) {
        useStore.getState().updateNodeData(nodeId, { text_content: appliedContent })
      }
    },
    [findPendingProposal, nodeId]
  )

  const rejectProposal = useCallback(
    async (args?: AcceptRejectArgs) => {
      const pending = findPendingProposal()
      const variantId = args?.variantId ?? pending?.proposalId
      if (!variantId) return

      setTurns((current) =>
        current.map((turn) => ({
          ...turn,
          variants: turn.variants.map((variant) =>
            variant.variantId === variantId ? { ...variant, proposalStatus: 'rejected' } : variant
          ),
        }))
      )
      await setProposalStatus(variantId, 'rejected')
    },
    [findPendingProposal]
  )

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    setIsLoading(false)
  }, [])

  const pendingProposal = useMemo(() => findPendingProposal(), [findPendingProposal])
  const messages = useMemo(() => deriveLegacyMessages(nodeId, turns), [nodeId, turns])

  return useMemo(
    () => ({
      threads,
      activeThreadId,
      setActiveThread,
      startNewThread,
      turns,
      sendMessage,
      regenerateVariant,
      setViewingVariant,
      setSelectedVariant,
      acceptProposal,
      rejectProposal,
      cancel,
      isLoading,
      error,
      messages,
      pendingProposal,
    }),
    [
      threads,
      activeThreadId,
      setActiveThread,
      startNewThread,
      turns,
      sendMessage,
      regenerateVariant,
      setViewingVariant,
      setSelectedVariant,
      acceptProposal,
      rejectProposal,
      cancel,
      isLoading,
      error,
      messages,
      pendingProposal,
    ]
  )
}
