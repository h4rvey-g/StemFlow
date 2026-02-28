import React from 'react'
import { createPortal } from 'react-dom'

import { ChatPanelBody } from './chat/ChatPanelBody'

interface NodeChatPanelProps {
  nodeId: string | null
  onClose: () => void
}

const NodeChatPanelContent = ({ nodeId, onClose }: { nodeId: string; onClose: () => void }) => {
  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/30">
      <button
        type="button"
        aria-label="Close chat panel backdrop"
        className="absolute inset-0"
        onClick={() => {
          onClose()
        }}
      />
      <aside
        data-testid="node-chat-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Node chat panel"
        className="relative z-10 flex h-full w-full max-w-xl flex-col border-l border-slate-200 bg-white shadow-2xl"
      >
        <ChatPanelBody nodeId={nodeId} onClose={onClose} />
      </aside>
    </div>,
    document.body
  )
}

export const NodeChatPanel = ({ nodeId, onClose }: NodeChatPanelProps) => {
  if (!nodeId) return null
  if (typeof document === 'undefined') return null

  return <NodeChatPanelContent nodeId={nodeId} onClose={onClose} />
}
