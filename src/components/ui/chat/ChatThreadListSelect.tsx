import React from 'react'

import type { ChatThreadView } from './chat-types'

const formatThreadUpdatedTime = (updatedAt: number): string => {
  const date = new Date(updatedAt)
  if (Number.isNaN(date.getTime())) {
    return 'Unknown time'
  }

  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}

const formatThreadOptionLabel = (thread: ChatThreadView): string => {
  return `${thread.title} · ${formatThreadUpdatedTime(thread.updatedAt)}`
}

interface ChatThreadListSelectProps {
  threads: ChatThreadView[]
  activeThreadId: string
  setActiveThread: (threadId: string) => Promise<void>
  startNewThread: () => Promise<string>
}

export const ChatThreadListSelect = ({
  threads,
  activeThreadId,
  setActiveThread,
  startNewThread,
}: ChatThreadListSelectProps) => {
  return (
    <>
      <select
        value={activeThreadId}
        onChange={(event) => {
          void setActiveThread(event.target.value)
        }}
        className="max-w-[160px] rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
        aria-label="Thread history"
      >
        {threads.map((thread) => (
          <option key={thread.id} value={thread.id}>
            {formatThreadOptionLabel(thread)}
          </option>
        ))}
      </select>

      <button
        type="button"
        onClick={() => {
          void startNewThread()
        }}
        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
      >
        New chat
      </button>
    </>
  )
}
