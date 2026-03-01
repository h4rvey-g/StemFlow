import React, { useEffect, useState } from 'react'

import { useNodeChat } from '@/hooks/useNodeChat'
import { useStore } from '@/stores/useStore'

import { ChatComposer } from './ChatComposer'
import { ChatConversation } from './ChatConversation'
import { ChatHeader } from './ChatHeader'
import type { ChatMessageView, ChatThreadView, ChatTurnView } from './chat-types'

interface ChatPanelBodyProps {
  nodeId: string
  onClose: () => void
}

export const ChatPanelBody = ({ nodeId, onClose }: ChatPanelBodyProps) => {
  const [draftMessage, setDraftMessage] = useState('')

  const {
    threads,
    activeThreadId,
    setActiveThread,
    startNewThread,
    turns,
    messages,
    isLoading,
    error,
    sendMessage,
    regenerateVariant,
    setViewingVariant,
    setSelectedVariant,
    acceptProposal,
    rejectProposal,
  } = useNodeChat(nodeId)

  const messageViews = messages as ChatMessageView[]
  const threadViews = threads as ChatThreadView[]
  const turnViews = turns as ChatTurnView[]

  const node = useStore((state) => state.nodes.find((item) => item.id === nodeId) ?? null)
  const currentNodeText = node?.data.text_content ?? ''
  const currentNodeTitle = node?.data.summary_title ?? ''

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return

      const target = event.target
      if (!(target instanceof HTMLElement)) {
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
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  return (
    <>
      <ChatHeader
        nodeId={nodeId}
        currentNodeTitle={currentNodeTitle}
        threads={threadViews}
        activeThreadId={activeThreadId}
        setActiveThread={setActiveThread}
        startNewThread={startNewThread}
        onClose={onClose}
      />

      <ChatConversation
        messages={messageViews}
        turns={turnViews}
        activeThreadId={activeThreadId}
        regenerateVariant={regenerateVariant}
        setViewingVariant={setViewingVariant}
        setSelectedVariant={setSelectedVariant}
        currentNodeText={currentNodeText}
        acceptProposal={acceptProposal}
        rejectProposal={rejectProposal}
        isLoading={isLoading}
        error={error}
      />

      <ChatComposer
        draftMessage={draftMessage}
        setDraftMessage={setDraftMessage}
        isLoading={isLoading}
        sendMessage={sendMessage}
      />
    </>
  )
}
