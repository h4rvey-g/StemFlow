import React, { memo, useCallback } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import { useStore } from '@/stores/useStore'
import type { GhostNodeData } from '@/types/nodes'

const typeColors: Record<string, string> = {
  OBSERVATION: 'border-blue-400 text-blue-600',
  MECHANISM: 'border-purple-400 text-purple-600',
  VALIDATION: 'border-green-400 text-green-600',
}

const typeLabels: Record<string, string> = {
  OBSERVATION: 'SUGGESTED OBSERVATION',
  MECHANISM: 'SUGGESTED MECHANISM',
  VALIDATION: 'SUGGESTED VALIDATION',
}

export const GhostNode = memo(({ data, isConnectable }: NodeProps<GhostNodeData>) => {
  console.log('[GhostNode] Rendering:', data?.ghostId, data?.suggestedType)
  const { text_content, suggestedType, ghostId } = data
  const acceptGhostNode = useStore((s) => s.acceptGhostNode)
  const dismissGhostNode = useStore((s) => s.dismissGhostNode)
  
  const handleAccept = useCallback(() => acceptGhostNode(ghostId), [acceptGhostNode, ghostId])
  const handleDismiss = useCallback(() => dismissGhostNode(ghostId), [dismissGhostNode, ghostId])
  
  const colorClass = typeColors[suggestedType] || 'border-gray-400 text-gray-600'

  return (
    <div
      className={`min-w-[180px] rounded-xl bg-yellow-200 border-4 border-solid border-red-500 ${colorClass} p-3 shadow-xl`}
      style={{ zIndex: 9999 }}
    >
      <Handle type="target" position={Position.Top} isConnectable={isConnectable} />
      
      <div className={`text-xs font-bold mb-1 ${colorClass.split(' ')[1]}`}>
        {typeLabels[suggestedType]}
      </div>
      
      <div className="text-sm italic text-gray-600 mb-3 min-h-[3rem]">
        {text_content}
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

      <Handle type="source" position={Position.Bottom} isConnectable={isConnectable} />
    </div>
  )
})

GhostNode.displayName = 'GhostNode'
