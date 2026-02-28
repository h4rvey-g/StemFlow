'use client'

import React, { useEffect, useMemo, useState, type FormEvent, type FC, memo } from 'react'

import { renderMarkdownEmphasis } from '@/lib/markdown-emphasis'
import { useNodeChat } from '@/hooks/useNodeChat'
import { useStore } from '@/stores/useStore'

interface ChatCardProps {
  nodeId: string
  onClose: () => void
}

type DiffKind = 'unchanged' | 'removed' | 'added'

interface DiffLine {
  key: string
  kind: DiffKind
  text: string
}

const buildSimpleDiff = (currentText: string, proposedText: string): DiffLine[] => {
  const currentLines = currentText.split(/\r?\n/)
  const proposedLines = proposedText.split(/\r?\n/)
  const maxLength = Math.max(currentLines.length, proposedLines.length)
  const output: DiffLine[] = []

  for (let index = 0; index < maxLength; index += 1) {
    const currentLine = currentLines[index]
    const proposedLine = proposedLines[index]

    if (currentLine === proposedLine && currentLine !== undefined) {
      output.push({ key: `same-${index}`, kind: 'unchanged', text: currentLine })
      continue
    }

    if (currentLine !== undefined) {
      output.push({ key: `removed-${index}`, kind: 'removed', text: currentLine })
    }

    if (proposedLine !== undefined) {
      output.push({ key: `added-${index}`, kind: 'added', text: proposedLine })
    }
  }

  return output
}

const previewContent = (value: string, maxChars = 320): string => {
  if (value.length <= maxChars) return value
  return `${value.slice(0, maxChars)}…`
}

export const ChatCard: FC<ChatCardProps> = memo(({ nodeId, onClose }) => {
  const [draftMessage, setDraftMessage] = useState('')

  const {
    messages,
    isLoading,
    error,
    pendingProposal,
    sendMessage,
    acceptProposal,
    rejectProposal,
    cancel,
  } = useNodeChat(nodeId)

  const node = useStore((state) => state.nodes.find((item) => item.id === nodeId) ?? null)
  const currentNodeText = node?.data.text_content ?? ''
  const currentNodeTitle = node?.data.summary_title ?? ''

  const diffLines = useMemo(() => {
    if (!pendingProposal) return []
    return buildSimpleDiff(currentNodeText, pendingProposal.payload.content)
  }, [currentNodeText, pendingProposal])

  const canSend = draftMessage.trim().length > 0 && !isLoading

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return

      const target = event.target
      if (!(target instanceof HTMLElement)) {
        cancel()
        onClose()
        return
      }

      const isEditable =
        target.isContentEditable ||
        target.getAttribute('contenteditable') === 'true' ||
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT'

      if (!isEditable) {
        cancel()
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [cancel, onClose])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const trimmed = draftMessage.trim()
    if (!trimmed || isLoading) return

    setDraftMessage('')
    await sendMessage(trimmed)
  }

  return (
    <div className="flex h-full w-full flex-col border-l border-slate-200 bg-white shadow-2xl">
      <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-slate-800">Node Chat</h2>
          <p className="mt-1 truncate text-xs text-slate-500">
            {currentNodeTitle ? `${currentNodeTitle} · ${nodeId}` : `Node ${nodeId}`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            cancel()
            onClose()
          }}
          className="rounded-full p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
          aria-label="Close chat panel"
        >
          ✕
        </button>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
            Ask a question or request a content revision for this node.
          </p>
        ) : (
          messages.map((message) => {
            const isUser = message.role === 'user'
            return (
              <article
                key={message.id}
                className={`max-w-[92%] rounded-lg px-3 py-2 text-sm leading-6 ${
                  isUser
                    ? 'ml-auto bg-indigo-500 text-white'
                    : 'mr-auto border border-slate-200 bg-slate-50 text-slate-700'
                }`}
              >
                {isUser ? (
                  <p className="whitespace-pre-wrap break-words">{message.content}</p>
                ) : (
                  <div className="space-y-2">{renderMarkdownEmphasis(message.content)}</div>
                )}
              </article>
            )
          })
        )}

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

        {pendingProposal ? (
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
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Diff preview
              </p>
              <pre className="max-h-48 overflow-y-auto rounded-md border border-slate-200 bg-white p-2 text-[11px] leading-5 text-slate-700">
                {diffLines.map((line) => {
                  if (line.kind === 'removed') {
                    return <div key={line.key} className="text-rose-700">- {line.text}</div>
                  }

                  if (line.kind === 'added') {
                    return <div key={line.key} className="text-emerald-700">+ {line.text}</div>
                  }

                  return <div key={line.key}>  {line.text}</div>
                })}
              </pre>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  void acceptProposal()
                }}
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700"
              >
                Accept
              </button>
              <button
                type="button"
                onClick={() => {
                  void rejectProposal()
                }}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              >
                Reject
              </button>
            </div>
          </section>
        ) : null}
      </div>

      <form onSubmit={handleSubmit} className="border-t border-slate-200 p-4">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={draftMessage}
            onChange={(event) => setDraftMessage(event.target.value)}
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
            placeholder="Ask about this node or request a revision..."
          />
          <button
            type="submit"
            disabled={!canSend}
            className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
          >
            {isLoading ? 'Sending…' : 'Send'}
          </button>
        </div>
      </form>
    </div>
  )
})

ChatCard.displayName = 'ChatCard'
