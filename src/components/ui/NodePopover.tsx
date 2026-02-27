import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

import { createRightwardPosition } from '@/lib/node-layout'
import { useAi } from '@/hooks/useAi'
import { useStore } from '@/stores/useStore'
import type { NodeType, OMVEdge, OMVNode } from '@/types/nodes'
import { StreamingText } from '@/components/ui/StreamingText'
import { useTranslation } from 'react-i18next'
import { MessageCircle, Globe } from 'lucide-react'

type TranslationLanguage = 'zh-CN' | 'en'
type PopoverAction = 'translation' | 'chat'

type Props = {
  nodeId: string
  nodeType: Exclude<NodeType, 'GHOST'>
  isOpen: boolean
  onClose: () => void
  anchorEl: HTMLElement
}

const ACTIONS: PopoverAction[] = ['translation', 'chat']

const ACTION_TRANSLATION_KEYS: Record<PopoverAction, string> = {
  translation: 'translation',
  chat: 'chat',
}

const getActionTranslationKey = (action: PopoverAction) => ACTION_TRANSLATION_KEYS[action]

const ActionIcon = ({ action }: { action: PopoverAction }) => {
  if (action === 'chat') {
    return <MessageCircle className="h-4 w-4 text-slate-500" aria-hidden="true" />
  }
  return <Globe className="h-4 w-4 text-slate-500" aria-hidden="true" />
}

export function NodePopover({ nodeId, nodeType, isOpen, onClose, anchorEl }: Props) {
  const { isLoading, streamingText, error, executeAction, translateNodeContent, cancel } = useAi(nodeId)
  const { t } = useTranslation()

  const addNode = useStore((s) => s.addNode)
  const addEdge = useStore((s) => s.addEdge)

  const [activeAction, setActiveAction] = useState<PopoverAction | null>(null)
  const [translationLanguage, setTranslationLanguage] = useState<TranslationLanguage>('zh-CN')
  const [showTranslationLanguagePicker, setShowTranslationLanguagePicker] = useState(false)
  const [rect, setRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null)

  useEffect(() => {
    if (!isOpen) return

    const r = anchorEl.getBoundingClientRect()
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
  }, [anchorEl, isOpen])

  if (!isOpen || !rect) return null

  const runAction = async (action: PopoverAction) => {
    if (action === 'chat') {
      window.dispatchEvent(new CustomEvent('stemflow:open-chat', { detail: { nodeId } }))
      return
    }

    if (action === 'translation') {
      setActiveAction(action)
      setShowTranslationLanguagePicker(true)
      return
    }

    setShowTranslationLanguagePicker(false)
    setActiveAction(action)
    await executeAction(action, undefined, { createNodeOnComplete: false })
  }

  const runTranslation = async () => {
    setActiveAction('translation')
    await translateNodeContent(translationLanguage)
  }

  const applyResult = () => {
    const state = useStore.getState()
    const source = state.nodes.find((n) => n.id === nodeId)
    if (!source) return

    const text = streamingText.trim()
    if (!text) return

    const nextType: Exclude<NodeType, 'GHOST'> = source.type === 'GHOST' ? nodeType : source.type
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

  const getActionLabel = (action: PopoverAction) => t(`popover.actions.${getActionTranslationKey(action)}`)

  return createPortal(
    <div className="fixed inset-0 z-[1000]">
      <button
        type="button"
        className="absolute inset-0"
        aria-label={t('common.close')}
        onMouseDown={onClose}
      />
      <div
        data-testid="node-popover"
        className="absolute z-[1001] w-[320px] rounded-xl border border-slate-200 bg-white/95 p-3 shadow-xl"
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
          {ACTIONS.map((action) => {
            const label = getActionLabel(action)

            return (
              <button
                key={action}
                type="button"
                className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-2 text-left text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
                onClick={() => runAction(action)}
                disabled={isLoading}
              >
                <ActionIcon action={action} />
                {label}
              </button>
            )
          })}
        </div>

        {showTranslationLanguagePicker ? (
          <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
            <label className="mb-1 block text-xs font-medium text-slate-700" htmlFor={`translation-language-${nodeId}`}>
              {t('popover.translation.languageLabel')}
            </label>
            <div className="flex items-center gap-2">
              <select
                id={`translation-language-${nodeId}`}
                className="flex-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700"
                value={translationLanguage}
                onChange={(event) => {
                  setTranslationLanguage(event.target.value as TranslationLanguage)
                }}
                disabled={isLoading}
              >
                <option value="zh-CN">{t('popover.translation.languages.zhCN')}</option>
                <option value="en">{t('popover.translation.languages.en')}</option>
              </select>
              <button
                type="button"
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm disabled:opacity-50"
                onClick={() => {
                  void runTranslation()
                }}
                disabled={isLoading}
              >
                {t('popover.translation.translate')}
              </button>
            </div>
          </div>
        ) : null}

        <div className="mt-3">
          {activeAction !== 'translation' && (streamingText || isLoading) ? (
            <StreamingText text={streamingText} isLoading={isLoading} />
          ) : null}
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
              disabled={!streamingText.trim() || activeAction === 'translation'}
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
