import React, { memo, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Handle, Position, NodeProps } from 'reactflow'

import { useStore } from '@/stores/useStore'
import { useGenerate } from '@/hooks/useGenerate'
import type { GhostNodeData } from '@/types/nodes'

const typeColors: Record<string, string> = {
  OBSERVATION: 'text-sky-700/90 dark:text-sky-300',
  MECHANISM: 'text-indigo-700/90 dark:text-indigo-300',
  VALIDATION: 'text-emerald-700/90 dark:text-emerald-300',
}

export const GhostNode = memo(({ data, isConnectable }: NodeProps<GhostNodeData>) => {
  const { t } = useTranslation()
  const { summary_title, suggestedType, ghostId } = data
  const dismissGhostNode = useStore((s) => s.dismissGhostNode)
  const { acceptGhost } = useGenerate()
  
  const handleAccept = useCallback(() => acceptGhost(ghostId), [acceptGhost, ghostId])
  const handleDismiss = useCallback(() => dismissGhostNode(ghostId), [dismissGhostNode, ghostId])
  
  const colorClass = typeColors[suggestedType] || 'text-slate-700 dark:text-slate-300'

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
      className={`group relative w-[320px] rounded-xl border-2 border-dashed border-slate-300/85 bg-white/85 p-3 text-slate-700 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-indigo-300 hover:bg-white/90 dark:border-slate-600/75 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:border-indigo-400/70 dark:hover:bg-slate-900/80`}
      style={{ zIndex: 46 }}
      data-testid="ghost-node-card"
    >
      <Handle type="target" position={Position.Left} isConnectable={isConnectable} />

      <div
        className="pointer-events-none absolute inset-0 rounded-xl opacity-25 [background-image:repeating-linear-gradient(-45deg,rgba(148,163,184,0.14)_0,rgba(148,163,184,0.14)_1px,transparent_1px,transparent_8px)] dark:[background-image:repeating-linear-gradient(-45deg,rgba(148,163,184,0.09)_0,rgba(148,163,184,0.09)_1px,transparent_1px,transparent_8px)]"
        aria-hidden
      />

      <div className="relative z-10">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className={`text-[11px] font-semibold uppercase tracking-[0.08em] ${colorClass}`}>
            {typeLabel}
          </div>
          <div className="inline-flex items-center gap-1 rounded-full border border-slate-300/75 bg-white/65 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:border-slate-500/70 dark:bg-slate-800/65 dark:text-slate-300">
            <svg
              viewBox="0 0 20 20"
              className="h-3 w-3 text-indigo-500/90"
              fill="currentColor"
              aria-hidden
            >
              <path d="M10 1.5l1.9 4.6 4.6 1.9-4.6 1.9-1.9 4.6-1.9-4.6-4.6-1.9 4.6-1.9L10 1.5z" />
            </svg>
            {t('nodes.ghost.aiDraft', { defaultValue: 'AI Draft' })}
          </div>
        </div>

        {summary_title?.trim() ? (
          <div className="mb-2 whitespace-pre-wrap break-words text-sm font-semibold text-slate-700 dark:text-slate-100">
            {summary_title}
          </div>
        ) : null}

        <div className="mt-3 flex items-center gap-1.5 rounded-lg border border-slate-200/80 bg-white/55 p-1.5 transition-colors duration-200 group-hover:border-slate-300/80 dark:border-slate-600/70 dark:bg-slate-900/50 dark:group-hover:border-slate-500/80">
          <button
            onClick={handleAccept}
            className="flex-1 rounded-md border border-emerald-300/70 bg-emerald-50/60 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 transition-colors hover:border-emerald-400 hover:bg-emerald-100/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/80 dark:border-emerald-400/55 dark:bg-emerald-400/10 dark:text-emerald-300 dark:hover:bg-emerald-400/20"
            aria-label={t('nodes.ghost.acceptSuggestion')}
          >
            {t('common.accept')}
          </button>
          <button
            onClick={handleDismiss}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-300/80 bg-white/60 text-slate-500 opacity-0 transition-all duration-200 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/80 dark:border-slate-500/80 dark:bg-slate-800/70 dark:text-slate-300 dark:hover:border-rose-400 dark:hover:bg-rose-400/15 dark:hover:text-rose-300"
            aria-label={t('nodes.ghost.dismissSuggestion')}
          >
            <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      <Handle type="source" position={Position.Right} isConnectable={false} />
    </div>
  )
})

GhostNode.displayName = 'GhostNode'
