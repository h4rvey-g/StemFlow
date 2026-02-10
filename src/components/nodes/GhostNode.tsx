import React, { memo, useCallback } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'

import { renderMarkdownEmphasis } from '@/lib/markdown-emphasis'
import { useStore } from '@/stores/useStore'
import type { GhostNodeData } from '@/types/nodes'

const typeColors: Record<string, string> = {
  OBSERVATION: 'text-blue-700',
  MECHANISM: 'text-violet-700',
  VALIDATION: 'text-emerald-700',
}

const typeLabels: Record<string, string> = {
  OBSERVATION: 'SUGGESTED OBSERVATION',
  MECHANISM: 'SUGGESTED MECHANISM',
  VALIDATION: 'SUGGESTED VALIDATION',
}

export const GhostNode = memo(({ data, isConnectable }: NodeProps<GhostNodeData>) => {
  const { text_content, summary_title, suggestedType, ghostId } = data
  const acceptGhostNode = useStore((s) => s.acceptGhostNode)
  const dismissGhostNode = useStore((s) => s.dismissGhostNode)
  
  const handleAccept = useCallback(() => acceptGhostNode(ghostId), [acceptGhostNode, ghostId])
  const handleDismiss = useCallback(() => dismissGhostNode(ghostId), [dismissGhostNode, ghostId])
  
  const colorClass = typeColors[suggestedType] || 'text-slate-700'

  return (
    <div
      className={`w-[320px] rounded-xl border-2 border-dashed border-slate-300 bg-white/70 p-3 shadow-lg backdrop-blur ${colorClass} opacity-80`}
      style={{ zIndex: 9999 }}
    >
      <Handle type="target" position={Position.Left} isConnectable={isConnectable} />
      
      <div className={`text-xs font-bold mb-1 ${colorClass}`}>
        {typeLabels[suggestedType]}
      </div>

      {summary_title?.trim() ? (
        <div className="mb-1 whitespace-pre-wrap break-words text-xs font-semibold text-slate-700">
          {summary_title}
        </div>
      ) : null}
      
      <div className="mb-3 min-h-[3rem] whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">
        {renderMarkdownEmphasis(text_content)}
      </div>

      <div className="flex gap-2 mt-2">
        <button
          onClick={handleAccept}
          className="flex-1 bg-green-100 hover:bg-green-200 text-green-700 text-xs font-medium py-1 px-2 rounded transition-colors"
          aria-label="Accept suggestion"
        >
          Accept
        </button>
        <button
          onClick={handleDismiss}
          className="flex-1 bg-red-100 hover:bg-red-200 text-red-700 text-xs font-medium py-1 px-2 rounded transition-colors"
          aria-label="Dismiss suggestion"
        >
          Dismiss
        </button>
      </div>

      <Handle type="source" position={Position.Right} isConnectable={false} />
    </div>
  )
})

GhostNode.displayName = 'GhostNode'
