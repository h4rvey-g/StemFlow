import React, { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import type { Citation } from '@/types/nodes'
import { NodeDetailCard } from './NodeDetailCard'

interface InspectorPanelProps {
  isOpen: boolean
  onClose: () => void
  children?: ReactNode
  nodeText?: string
  nodeType?: 'OBSERVATION' | 'MECHANISM' | 'VALIDATION' | 'GHOST'
  summaryTitle?: string
  translatedTitle?: string
  translatedTextContent?: string
  translatedLanguage?: 'zh-CN' | 'en'
  nodePlaceholder?: string
  onNodeTextChange?: (nextText: string) => void
  citations?: Citation[]
}

export const InspectorPanel = ({
  isOpen,
  onClose,
  children,
  nodeText,
  nodeType,
  summaryTitle,
  translatedTitle,
  translatedTextContent,
  translatedLanguage,
  nodePlaceholder,
  onNodeTextChange,
  citations = [],
}: InspectorPanelProps) => {
  const { t } = useTranslation()

  useEffect(() => {
    if (!isOpen) return
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
  }, [isOpen, onClose])

  if (!isOpen) return null

  return createPortal(
    <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        data-testid="inspector-panel"
        className="flex h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 p-4">
          <h2 className="text-sm font-semibold text-slate-800">
            {summaryTitle || t('inspector.title')}
          </h2>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label={t('common.close')}
          >
            ✕
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <NodeDetailCard
            nodeText={nodeText}
            nodeType={nodeType}
            summaryTitle={summaryTitle}
            translatedTitle={translatedTitle}
            translatedTextContent={translatedTextContent}
            translatedLanguage={translatedLanguage}
            nodePlaceholder={nodePlaceholder}
            onNodeTextChange={onNodeTextChange}
            citations={citations}
          />
          {children}
        </div>
      </div>
    </div>,
    document.body
  )
}
