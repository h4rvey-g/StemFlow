import React, { memo, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Handle, Position, NodeProps } from 'reactflow'

import { useStore } from '@/stores/useStore'
import { useGenerate } from '@/hooks/useGenerate'
import type { GhostNodeData } from '@/types/nodes'

const typeColors: Record<string, string> = {
  OBSERVATION: 'text-blue-700',
  MECHANISM: 'text-violet-700',
  VALIDATION: 'text-emerald-700',
}

export const GhostNode = memo(({ data, isConnectable }: NodeProps<GhostNodeData>) => {
  const { t } = useTranslation()
  const { summary_title, suggestedType, ghostId } = data
  const dismissGhostNode = useStore((s) => s.dismissGhostNode)
  const { acceptGhost } = useGenerate()
  
  const handleAccept = useCallback(() => acceptGhost(ghostId), [acceptGhost, ghostId])
  const handleDismiss = useCallback(() => dismissGhostNode(ghostId), [dismissGhostNode, ghostId])
  
  const colorClass = typeColors[suggestedType] || 'text-slate-700'

  const typeLabel = useMemo(() => {
    switch (suggestedType) {
      case 'OBSERVATION': return t('nodes.ghost.suggestedObservation')
      case 'MECHANISM': return t('nodes.ghost.suggestedMechanism')
      case 'VALIDATION': return t('nodes.ghost.suggestedValidation')
      default: return ''
    }
  }, [suggestedType, t])

  return (
    <div
      className={`w-[320px] rounded-xl border-2 border-dashed border-slate-300 bg-white/70 p-3 shadow-lg backdrop-blur ${colorClass} opacity-80 dark:border-slate-600 dark:bg-slate-800/85`}
      style={{ zIndex: 9999 }}
    >
      <Handle type="target" position={Position.Left} isConnectable={isConnectable} />
      
      <div className={`text-xs font-bold mb-1 ${colorClass}`}>
        {typeLabel}
      </div>

      {summary_title?.trim() ? (
        <div className="mb-3 whitespace-pre-wrap break-words text-sm font-semibold text-slate-700 dark:text-slate-100">
          {summary_title}
        </div>
      ) : null}
      
      <div className="flex gap-2 mt-2">
        <button
          onClick={handleAccept}
          className="flex-1 bg-green-100 hover:bg-green-200 text-green-700 text-xs font-medium py-1 px-2 rounded transition-colors"
          aria-label={t('nodes.ghost.acceptSuggestion')}
        >
          {t('common.accept')}
        </button>
        <button
          onClick={handleDismiss}
          className="flex-1 bg-red-100 hover:bg-red-200 text-red-700 text-xs font-medium py-1 px-2 rounded transition-colors"
          aria-label={t('nodes.ghost.dismissSuggestion')}
        >
          {t('common.dismiss')}
        </button>
      </div>

      <Handle type="source" position={Position.Right} isConnectable={false} />
    </div>
  )
})

GhostNode.displayName = 'GhostNode'
