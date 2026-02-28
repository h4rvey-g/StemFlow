import React from 'react'

import { renderMarkdownEmphasis } from '@/lib/markdown-emphasis'

import { ChatMessageActions } from './ChatMessageActions'
import type { AssistantVariantView, ChatMessageView, ChatTurnView as ChatTurn } from './chat-types'

interface ChatTurnViewProps {
  message: ChatMessageView
  turn: ChatTurn | undefined
  variant: AssistantVariantView | undefined
  visibleVariant: AssistantVariantView | undefined
  activeThreadId: string
  currentNodeText: string
  copiedMessageId: string | null
  onCopy: (messageId: string, content: string) => Promise<void>
  onRegenerate: (args: { threadId: string; turnId: string; fromVariantId?: string }) => Promise<void>
  onSelectViewingVariant: (args: { threadId: string; turnId: string; ordinal: number }) => void
  onUseForFutureReplies: (args: { threadId: string; turnId: string; ordinal: number }) => Promise<void>
  onAcceptProposal: (args: { variantId: string }) => Promise<void>
  onRejectProposal: (args: { variantId: string }) => Promise<void>
}

export const ChatTurnView = ({
  message,
  turn,
  variant,
  visibleVariant,
  activeThreadId,
  currentNodeText,
  copiedMessageId,
  onCopy,
  onRegenerate,
  onSelectViewingVariant,
  onUseForFutureReplies,
  onAcceptProposal,
  onRejectProposal,
}: ChatTurnViewProps) => {
  const isUser = message.role === 'user'

  return (
    <article
      className={`max-w-[92%] rounded-lg px-3 py-2 text-sm leading-6 ${
        isUser
          ? 'ml-auto bg-indigo-500 text-white'
          : 'mr-auto border border-slate-200 bg-slate-50 text-slate-700'
      }`}
    >
      {isUser ? (
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
      ) : (
        <div className="space-y-2">
          {renderMarkdownEmphasis(visibleVariant?.contentText ?? message.content)}

          {turn && variant ? (
            <ChatMessageActions
              messageId={message.id}
              messageContent={visibleVariant?.contentText ?? message.content}
              activeThreadId={activeThreadId}
              turnId={turn.turnId}
              fromVariantId={variant.variantId}
              variantOrdinals={turn.variants.map((candidateVariant) => candidateVariant.ordinal)}
              visibleOrdinal={turn.viewingVariantOrdinal ?? variant.ordinal ?? null}
              currentNodeText={currentNodeText}
              proposal={visibleVariant?.mode === 'proposal' ? visibleVariant.proposal : undefined}
              proposalStatus={visibleVariant?.proposalStatus}
              copiedMessageId={copiedMessageId}
              onCopy={onCopy}
              onRegenerate={onRegenerate}
              onSelectViewingVariant={onSelectViewingVariant}
              onUseForFutureReplies={onUseForFutureReplies}
              onAcceptProposal={onAcceptProposal}
              onRejectProposal={onRejectProposal}
            />
          ) : null}
        </div>
      )}
    </article>
  )
}
