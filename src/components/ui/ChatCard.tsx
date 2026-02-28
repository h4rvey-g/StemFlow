'use client'

import React, { type FC, memo } from 'react'

import { ChatPanelBody } from './chat/ChatPanelBody'

interface ChatCardProps {
  nodeId: string
  onClose: () => void
}

export const ChatCard: FC<ChatCardProps> = memo(({ nodeId, onClose }) => {
  return (
    <div className="flex h-full w-full flex-col border-l border-slate-200 bg-white shadow-2xl">
      <ChatPanelBody nodeId={nodeId} onClose={onClose} />
    </div>
  )
})

ChatCard.displayName = 'ChatCard'
