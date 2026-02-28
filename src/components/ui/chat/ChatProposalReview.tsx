import React from 'react'

import { buildSimpleDiff, previewContent } from './chat-utils'
import type { PendingProposalView } from './chat-types'

interface ChatProposalReviewProps {
  pendingProposal: PendingProposalView
  currentNodeText: string
  onAccept: () => void
  onReject: () => void
}

export const ChatProposalReview = ({
  pendingProposal,
  currentNodeText,
  onAccept,
  onReject,
}: ChatProposalReviewProps) => {
  const diffLines = buildSimpleDiff(currentNodeText, pendingProposal.payload.content)

  return (
    <section className="space-y-3 rounded-xl border border-indigo-200 bg-indigo-50/40 p-3">
      <h3 className="text-sm font-semibold text-indigo-900">Pending proposal</h3>
      <div className="space-y-1 text-xs text-slate-700">
        <p>
          <span className="font-semibold text-slate-900">Title:</span>{' '}
          {pendingProposal.payload.title}
        </p>
        <p>
          <span className="font-semibold text-slate-900">Rationale:</span>{' '}
          {pendingProposal.payload.rationale}
        </p>
        <p>
          <span className="font-semibold text-slate-900">Content preview:</span>{' '}
          {previewContent(pendingProposal.payload.content)}
        </p>
      </div>

      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Diff preview</p>
        <pre className="max-h-48 overflow-y-auto rounded-md border border-slate-200 bg-white p-2 text-[11px] leading-5 text-slate-700">
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
          onClick={onAccept}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700"
        >
          Accept
        </button>
        <button
          type="button"
          onClick={onReject}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
        >
          Reject
        </button>
      </div>
    </section>
  )
}
