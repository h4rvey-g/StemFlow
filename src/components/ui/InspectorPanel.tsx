"use client"

import React, { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { renderMarkdownEmphasis } from '@/lib/markdown-emphasis'
import type { Citation } from '@/types/nodes'

interface InspectorPanelProps {
  isOpen: boolean
  onClose: () => void
  children?: ReactNode
  nodeText?: string
  citations?: Citation[]
}

export const InspectorPanel = ({ isOpen, onClose, children, nodeText, citations = [] }: InspectorPanelProps) => {
  const { t } = useTranslation()
  const [isCitationsExpanded, setIsCitationsExpanded] = useState(false)

  useEffect(() => {
    if (!isOpen) return

    setIsCitationsExpanded(false)
  }, [isOpen])

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
      className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        data-testid="inspector-panel"
        className="flex h-full w-96 flex-col overflow-y-auto border-l border-slate-200 bg-white shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 p-4">
          <h2 className="text-sm font-semibold text-slate-800">
            {t('inspector.title')}
          </h2>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label={t('common.close')}
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {nodeText && nodeText.trim().length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                {t('inspector.longText')}
              </h3>
              <div className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-700">
                {renderMarkdownEmphasis(nodeText, citations)}
              </div>
            </div>
          )}
          <div>
            <button
              type="button"
              className="mb-2 flex w-full items-center justify-between rounded-md px-1 py-1 text-left transition-colors hover:bg-slate-50"
              onClick={() => {
                setIsCitationsExpanded((current) => !current)
              }}
              aria-expanded={isCitationsExpanded}
              aria-controls="inspector-citations-content"
            >
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t('inspector.citations')}
              </span>
              <span className="text-slate-400">{isCitationsExpanded ? '▾' : '▸'}</span>
            </button>
            {isCitationsExpanded &&
              (citations.length > 0 ? (
                <div id="inspector-citations-content" className="space-y-2">
                  {citations.map((c) => (
                    <div key={c.index} className="text-sm text-slate-600 space-y-1">
                      <div>
                        <span className="font-medium">[{c.index}]</span>{' '}
                        <a
                          href={c.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          {c.title}
                        </a>
                        {c.publishedDate && <span className="text-slate-400 ml-1">({c.publishedDate})</span>}
                      </div>
                      {c.snippet && <div className="text-xs text-slate-500 pl-6">{c.snippet}</div>}
                    </div>
                  ))}
                </div>
              ) : (
                <p id="inspector-citations-content" className="text-sm text-slate-400">
                  {t('inspector.noCitations')}
                </p>
              ))}
          </div>
          {children}
        </div>
      </div>
    </div>,
    document.body
  )
}
