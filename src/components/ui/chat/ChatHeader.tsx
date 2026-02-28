import React from 'react'

import { ChatThreadHeader } from './ChatThreadHeader'
import type { ChatThreadView } from './chat-types'

interface ChatHeaderProps {
  nodeId: string
  currentNodeTitle: string
  onClose: () => void
  threads: ChatThreadView[]
  activeThreadId: string
  setActiveThread: (threadId: string) => Promise<void>
  startNewThread: () => Promise<string>
}

export const ChatHeader = ({
  nodeId,
  currentNodeTitle,
  onClose,
  threads,
  activeThreadId,
  setActiveThread,
  startNewThread,
}: ChatHeaderProps) => {
  return (
    <ChatThreadHeader
      nodeId={nodeId}
      currentNodeTitle={currentNodeTitle}
      onClose={onClose}
      threads={threads}
      activeThreadId={activeThreadId}
      setActiveThread={setActiveThread}
      startNewThread={startNewThread}
    />
  )
}
