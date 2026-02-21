import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

import type { AiAction } from '@/lib/ai/types'
import { createRightwardPosition } from '@/lib/node-layout'
import { useAi } from '@/hooks/useAi'
import { useStore } from '@/stores/useStore'
import type { NodeType, OMVEdge, OMVNode } from '@/types/nodes'
import { StreamingText } from '@/components/ui/StreamingText'
import { useTranslation } from 'react-i18next'

type Props = {
  nodeId: string
  nodeType: Exclude<NodeType, 'GHOST'>
  isOpen: boolean
  onClose: () => void
  anchorEl: HTMLElement
}

const ACTIONS: AiAction[] = ['summarize', 'suggest-mechanism', 'critique', 'expand', 'questions']

const ACTION_TRANSLATION_KEYS: Record<AiAction, string> = {
  summarize: 'summarize',
  'suggest-mechanism': 'suggestMechanism',
  critique: 'critique',
  expand: 'expand',
  questions: 'generateQuestions',
}

const getActionTranslationKey = (action: AiAction, nodeType: NodeType) =>
  action === 'suggest-mechanism' && nodeType === 'MECHANISM'
    ? 'suggestValidation'
    : ACTION_TRANSLATION_KEYS[action]

export function NodePopover({ nodeId, nodeType, isOpen, onClose, anchorEl }: Props) {
  const { isLoading, streamingText, error, executeAction, cancel } = useAi(nodeId)
  const { t } = useTranslation()

  const addNode = useStore((s) => s.addNode)
  const addEdge = useStore((s) => s.addEdge)

  const [activeAction, setActiveAction] = useState<AiAction | null>(null)
  const [rect, setRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null)

  useEffect(() => {
    if (!isOpen) return

    const r = anchorEl.getBoundingClientRect()
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
  }, [anchorEl, isOpen])

  if (!isOpen || !rect) return null

  const runAction = async (action: AiAction) => {
    setActiveAction(action)
    await executeAction(action, undefined, { createNodeOnComplete: false })
  }

  const applyResult = () => {
    const state = useStore.getState()
    const source = state.nodes.find((n) => n.id === nodeId)
    if (!source) return

    const text = streamingText.trim()
    if (!text) return

    const sourceType: Exclude<NodeType, 'GHOST'> = source.type === 'GHOST' ? nodeType : source.type
    const nextType: Exclude<NodeType, 'GHOST'> =
      activeAction === 'suggest-mechanism'
        ? sourceType === 'MECHANISM'
          ? 'VALIDATION'
          : sourceType === 'OBSERVATION'
            ? 'MECHANISM'
            : sourceType
        : sourceType
    const newNodeId = `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const position = createRightwardPosition(source.position)

    const newNode: OMVNode = {
      id: newNodeId,
      type: nextType,
      position,
      data: { text_content: text },
    }

    const edge: OMVEdge = {
      id: `edge-${nodeId}-${newNodeId}`,
      source: nodeId,
      target: newNodeId,
    }

    addNode(newNode)
    addEdge(edge)

    onClose()
  }

  const showSuggest = nodeType === 'OBSERVATION' || nodeType === 'MECHANISM'

  const getActionLabel = (action: AiAction) => t(`popover.actions.${getActionTranslationKey(action, nodeType)}`)

  return createPortal(
    <div
      className="fixed inset-0 z-[1000]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        data-testid="node-popover"
        className="absolute w-[320px] rounded-xl border border-slate-200 bg-white/95 p-3 shadow-xl"
        style={{
          left: Math.min(rect.left, window.innerWidth - 340),
          top: Math.min(rect.top + rect.height + 8, window.innerHeight - 360),
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">{t('popover.title')}</div>
          <button
            type="button"
            className="rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-100"
            aria-label={t('common.close')}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="mt-2 grid grid-cols-2 gap-2">
          {ACTIONS.filter((a) => (a === 'suggest-mechanism' ? showSuggest : true)).map((action) => {
            const label = getActionLabel(action)

            return (
              <button
                key={action}
                type="button"
                className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-left text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
                onClick={() => runAction(action)}
                disabled={isLoading}
              >
                {label}
              </button>
            )
          })}
        </div>

        <div className="mt-3">
          <StreamingText text={streamingText} isLoading={isLoading} />
          {error ? (
            <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error.message}
            </div>
          ) : null}
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          {isLoading ? (
            <button
              type="button"
              className="rounded-md bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
              onClick={cancel}
            >
              {t('common.cancel')}
            </button>
          ) : (
            <button
              type="button"
              className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
              disabled={!streamingText.trim()}
              onClick={applyResult}
            >
              {t('common.apply')}
            </button>
          )}
          <div className="text-[11px] text-slate-500">
            {activeAction ? t('popover.status.active', { action: getActionLabel(activeAction) }) : ''}
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
