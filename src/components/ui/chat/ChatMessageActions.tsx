import React from 'react'

import { ChatVariantPicker } from './ChatVariantPicker'
import { buildSimpleDiff, previewContent } from './chat-utils'

type ProposalStatus = 'pending' | 'accepted' | 'rejected'

interface ChatMessageActionsProps {
  messageId: string
  messageContent: string
  activeThreadId: string
  turnId: string
  fromVariantId: string
  variantOrdinals: number[]
  visibleOrdinal: number | null
  currentNodeText: string
  proposal?: {
    title: string
    rationale: string
    content: string
    confidence?: number
    diffSummary?: string
  }
  proposalStatus?: ProposalStatus
  copiedMessageId: string | null
  onCopy: (messageId: string, content: string) => Promise<void>
  onRegenerate: (args: { threadId: string; turnId: string; fromVariantId?: string }) => Promise<void>
  onSelectViewingVariant: (args: { threadId: string; turnId: string; ordinal: number }) => void
  onUseForFutureReplies: (args: { threadId: string; turnId: string; ordinal: number }) => Promise<void>
  onAcceptProposal: (args: { variantId: string }) => Promise<void>
  onRejectProposal: (args: { variantId: string }) => Promise<void>
}

export const ChatMessageActions = ({
  messageId,
  messageContent,
  activeThreadId,
  turnId,
  fromVariantId,
  variantOrdinals,
  visibleOrdinal,
  currentNodeText,
  proposal,
  proposalStatus,
  copiedMessageId,
  onCopy,
  onRegenerate,
  onSelectViewingVariant,
  onUseForFutureReplies,
  onAcceptProposal,
  onRejectProposal,
}: ChatMessageActionsProps) => {
  const diffLines = proposal ? buildSimpleDiff(currentNodeText, proposal.content) : []
  const isPendingProposal = proposal && (proposalStatus === undefined || proposalStatus === 'pending')

  return (
    <div className="space-y-2 pt-1">
      {isPendingProposal ? (
        <section className="space-y-2 rounded-md border border-indigo-200 bg-indigo-50/40 p-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-800">Pending proposal</p>
          <div className="space-y-1 text-[11px] text-slate-700">
            <p>
              <span className="font-semibold text-slate-900">Title:</span> {proposal.title}
            </p>
            <p>
              <span className="font-semibold text-slate-900">Rationale:</span> {proposal.rationale}
            </p>
            <p>
              <span className="font-semibold text-slate-900">Content preview:</span>{' '}
              {previewContent(proposal.content)}
            </p>
          </div>

          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Diff preview</p>
            <pre className="max-h-40 overflow-y-auto rounded-md border border-slate-200 bg-white p-2 text-[11px] leading-5 text-slate-700">
              {diffLines.map((line) => {
                if (line.kind === 'removed') {
                  return (
                    <div key={line.key} className="text-rose-700">
                      - {line.text}
                    </div>
                  )
                }
                if (line.kind === 'added') {
                  return (
                    <div key={line.key} className="text-emerald-700">
                      + {line.text}
                    </div>
                  )
                }
                return <div key={line.key}>  {line.text}</div>
              })}
            </pre>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                void onAcceptProposal({ variantId: fromVariantId })
              }}
              className="rounded-md bg-indigo-600 px-2 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-indigo-700"
            >
              Accept
            </button>
            <button
              type="button"
              onClick={() => {
                void onRejectProposal({ variantId: fromVariantId })
              }}
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
              Reject
            </button>
          </div>
        </section>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => {
          void onCopy(messageId, messageContent)
        }}
        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 transition-colors hover:bg-slate-50"
      >
        {copiedMessageId === messageId ? 'Copied' : 'Copy'}
      </button>

      <button
        type="button"
        onClick={() => {
          void onRegenerate({
            threadId: activeThreadId,
            turnId,
            fromVariantId,
          })
        }}
        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 transition-colors hover:bg-slate-50"
      >
        Regenerate
      </button>

      <ChatVariantPicker
        turnId={turnId}
        variantOrdinals={variantOrdinals}
        visibleOrdinal={visibleOrdinal}
        onSelectViewingVariant={(ordinal) => {
          onSelectViewingVariant({ threadId: activeThreadId, turnId, ordinal })
        }}
        onUseForFutureReplies={async (ordinal) => {
          await onUseForFutureReplies({ threadId: activeThreadId, turnId, ordinal })
        }}
      />
      </div>
    </div>
  )
}
