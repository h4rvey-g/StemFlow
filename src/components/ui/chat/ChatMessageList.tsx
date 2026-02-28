import React from 'react'
import { useState } from 'react'

import { ChatTurnView } from './ChatTurnView'
import { copyToClipboard } from './copy-to-clipboard'
import type { ChatMessageView, ChatTurnView as ChatTurn } from './chat-types'

interface ChatMessageListProps {
  messages: ChatMessageView[]
  turns: ChatTurn[]
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
}

export const ChatMessageList = ({
  messages,
  turns,
  activeThreadId,
  regenerateVariant,
  setViewingVariant,
  setSelectedVariant,
  currentNodeText,
  acceptProposal,
  rejectProposal,
}: ChatMessageListProps) => {
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)

  const handleCopy = async (messageId: string, content: string) => {
    try {
      await copyToClipboard(content)
      setCopiedMessageId(messageId)
      window.setTimeout(() => {
        setCopiedMessageId((current) => (current === messageId ? null : current))
      }, 2000)
    } catch {
      setCopiedMessageId(null)
    }
  }

  if (messages.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
        Ask a question or request a content revision for this node.
      </p>
    )
  }

  return (
    <>
      {messages.map((message) => {
        const turn = turns.find((candidateTurn) =>
          candidateTurn.variants.some((candidateVariant) => candidateVariant.variantId === message.id)
        )
        const variant = turn?.variants.find((candidateVariant) => candidateVariant.variantId === message.id)
        const visibleOrdinal = turn?.viewingVariantOrdinal ?? variant?.ordinal ?? null
        const visibleVariant =
          visibleOrdinal === null
            ? variant
            : turn?.variants.find((candidateVariant) => candidateVariant.ordinal === visibleOrdinal) ?? variant

        return (
          <ChatTurnView
            key={message.id}
            message={message}
            turn={turn}
            variant={variant}
            visibleVariant={visibleVariant}
            activeThreadId={activeThreadId}
            currentNodeText={currentNodeText}
            copiedMessageId={copiedMessageId}
            onCopy={handleCopy}
            onRegenerate={regenerateVariant}
            onSelectViewingVariant={setViewingVariant}
            onUseForFutureReplies={setSelectedVariant}
            onAcceptProposal={acceptProposal}
            onRejectProposal={rejectProposal}
          />
        )
      })}
    </>
  )
}
