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
  const [isCitationsExpanded, setIsCitationsExpanded] = useState(false)
  const [isEditingText, setIsEditingText] = useState(false)
  const [draftNodeText, setDraftNodeText] = useState(nodeText ?? '')
  const normalizedTranslatedTitle = translatedTitle?.trim() ?? ''
  const normalizedTranslatedTextContent = translatedTextContent?.trim() ?? ''
  const hasTranslatedContent = normalizedTranslatedTitle.length > 0 || normalizedTranslatedTextContent.length > 0

  useEffect(() => {
    if (!isOpen) return

    setIsCitationsExpanded(false)
    setIsEditingText(false)
    setDraftNodeText(nodeText ?? '')
  }, [isOpen])

  useEffect(() => {
    if (isEditingText) return

    setDraftNodeText(nodeText ?? '')
  }, [isEditingText, nodeText])

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
          {onNodeTextChange || (nodeText && nodeText.trim().length > 0) ? (
            <div className="group">
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {isEditingText ? t('inspector.editor') : t('inspector.longText')}
                </h3>
                {onNodeTextChange && !isEditingText ? (
                  <button
                    type="button"
                    className="rounded-md p-1.5 text-slate-400 opacity-0 transition-all hover:bg-slate-100 hover:text-slate-600 group-hover:opacity-100"
                    onClick={() => {
                      setDraftNodeText(nodeText ?? '')
                      setIsEditingText(true)
                    }}
                    aria-label={t('common.edit')}
                    title={t('common.edit')}
                  >
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                      />
                    </svg>
                  </button>
                ) : null}
                {isEditingText ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
                      onClick={() => {
                        setDraftNodeText(nodeText ?? '')
                        setIsEditingText(false)
                      }}
                    >
                      {t('common.cancel')}
                    </button>
                    <button
                      type="button"
                      className="rounded-md bg-indigo-500 px-2 py-1 text-xs font-semibold text-white transition-colors hover:bg-indigo-600"
                      onClick={() => {
                        onNodeTextChange?.(draftNodeText)
                        setIsEditingText(false)
                      }}
                    >
                      {t('common.save')}
                    </button>
                  </div>
                ) : null}
              </div>

              {onNodeTextChange && isEditingText ? (
                <textarea
                  data-testid="inspector-node-editor"
                  className="w-full min-h-[220px] resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                  value={draftNodeText}
                  placeholder={nodePlaceholder ?? ''}
                  onChange={(event) => setDraftNodeText(event.target.value)}
                />
              ) : (
                <>
                  <div className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-700" style={{ maxWidth: '65ch' }}>
                    {nodeText && nodeText.trim().length > 0
                      ? renderMarkdownEmphasis(nodeText, citations)
                      : nodePlaceholder ?? ''}
                  </div>
                  {hasTranslatedContent ? (
                    <div className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-slate-700" style={{ maxWidth: '65ch' }}>
                      {normalizedTranslatedTitle.length > 0 ? (
                        <div className="mb-1 text-sm font-semibold text-slate-800">
                          {normalizedTranslatedTitle}
                        </div>
                      ) : null}
                      {normalizedTranslatedTextContent.length > 0
                        ? renderMarkdownEmphasis(normalizedTranslatedTextContent, citations)
                        : null}
                      <div className="mt-1 text-xs text-slate-500">
                        {translatedLanguage === 'en' ? 'English' : '简体中文'}
                      </div>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          ) : null}
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
