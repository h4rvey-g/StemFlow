import React from 'react'

import { ChatMessageList } from './ChatMessageList'
import type { ChatMessageView, ChatTurnView } from './chat-types'

interface ChatConversationProps {
  messages: ChatMessageView[]
  turns: ChatTurnView[]
  activeThreadId: string
  regenerateVariant: (args: {
    threadId: string
    turnId: string
    fromVariantId?: string
  }) => Promise<void>
  setViewingVariant: (args: {
    threadId: string
    turnId: string
    ordinal: number
  }) => void
  setSelectedVariant: (args: {
    threadId: string
    turnId: string
    ordinal: number
  }) => Promise<void>
  currentNodeText: string
  acceptProposal: (args: { variantId: string }) => Promise<void>
  rejectProposal: (args: { variantId: string }) => Promise<void>
  isLoading: boolean
  error: string | null
}

export const ChatConversation = ({
  messages,
  turns,
  activeThreadId,
  regenerateVariant,
  setViewingVariant,
  setSelectedVariant,
  currentNodeText,
  acceptProposal,
  rejectProposal,
  isLoading,
  error,
}: ChatConversationProps) => {
  return (
    <div className="flex-1 space-y-3 overflow-y-auto p-4">
      <ChatMessageList
        messages={messages}
        turns={turns}
        activeThreadId={activeThreadId}
        regenerateVariant={regenerateVariant}
        setViewingVariant={setViewingVariant}
        setSelectedVariant={setSelectedVariant}
        currentNodeText={currentNodeText}
        acceptProposal={acceptProposal}
        rejectProposal={rejectProposal}
      />

      {isLoading ? (
        <div className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
          <span className="h-3 w-3 animate-spin rounded-full border border-slate-400 border-t-transparent" />
          Generating response…
        </div>
      ) : null}

      {error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </div>
      ) : null}

    </div>
  )
}
