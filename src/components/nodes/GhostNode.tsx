import React, { memo, useCallback, useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Handle, Position, NodeProps } from 'reactflow'

import { renderMarkdownEmphasis } from '@/lib/markdown-emphasis'
import { useStore } from '@/stores/useStore'
import type { GhostNodeData, Citation } from '@/types/nodes'

const typeColors: Record<string, string> = {
  OBSERVATION: 'text-blue-700',
  MECHANISM: 'text-violet-700',
  VALIDATION: 'text-emerald-700',
}

const ReferencesSection = ({ citations }: { citations: Citation[] }) => {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="nodrag nopan mt-2 border-t border-slate-200 pt-2">
      <button
        type="button"
        className="flex w-full items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 hover:text-slate-500 transition-colors"
        onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v) }}
      >
        <span className="transition-transform" style={{ display: 'inline-block', transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
        {t('nodes.card.references', { count: citations.length })}
      </button>
      {expanded ? (
        <div className="mt-1">
          {citations.map((c) => (
            <div key={c.index} className="text-[11px] leading-4 text-slate-500 mb-0.5">
              <span className="font-medium text-slate-600">[{c.index}]</span>{' '}
              <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                {c.title}
              </a>
              {c.publishedDate ? <span className="text-slate-400 ml-1">({c.publishedDate})</span> : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export const GhostNode = memo(({ data, isConnectable }: NodeProps<GhostNodeData>) => {
  const { t } = useTranslation()
  const { text_content, summary_title, suggestedType, ghostId, citations } = data
  const acceptGhostNode = useStore((s) => s.acceptGhostNode)
  const dismissGhostNode = useStore((s) => s.dismissGhostNode)
  
  const handleAccept = useCallback(() => acceptGhostNode(ghostId), [acceptGhostNode, ghostId])
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
        <div className="mb-1 whitespace-pre-wrap break-words text-xs font-semibold text-slate-700 dark:text-slate-100">
          {summary_title}
        </div>
      ) : null}
      
      <div className="mb-3 min-h-[3rem] whitespace-pre-wrap break-words text-sm leading-6 text-slate-600 dark:text-slate-200">
        {renderMarkdownEmphasis(text_content, citations)}
      </div>

      {citations && citations.length > 0 ? (
        <ReferencesSection citations={citations} />
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
