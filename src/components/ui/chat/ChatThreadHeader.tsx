import React from 'react'

import { ChatThreadListSelect } from './ChatThreadListSelect'
import type { ChatThreadView } from './chat-types'

interface ChatThreadHeaderProps {
  nodeId: string
  currentNodeTitle: string
  onClose: () => void
  threads: ChatThreadView[]
  activeThreadId: string
  setActiveThread: (threadId: string) => Promise<void>
  startNewThread: () => Promise<string>
}

export const ChatThreadHeader = ({
  nodeId,
  currentNodeTitle,
  onClose,
  threads,
  activeThreadId,
  setActiveThread,
  startNewThread,
}: ChatThreadHeaderProps) => {
  return (
    <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
      <div className="min-w-0">
        <h2 className="truncate text-sm font-semibold text-slate-800">Node Chat</h2>
        <p className="mt-1 truncate text-xs text-slate-500">
          {currentNodeTitle ? `${currentNodeTitle} · ${nodeId}` : `Node ${nodeId}`}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <ChatThreadListSelect
          threads={threads}
          activeThreadId={activeThreadId}
          setActiveThread={setActiveThread}
          startNewThread={startNewThread}
        />

        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
          aria-label="Close chat panel"
        >
          ✕
        </button>
      </div>
    </header>
  )
}
