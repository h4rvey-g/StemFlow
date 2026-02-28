import React, { useEffect, type FC, type ReactNode, useCallback, memo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { ChatCard } from './ChatCard'
import { NodeDetailCard } from './NodeDetailCard'
import type { Citation } from '@/types/nodes'

const CHAT_TRANSITION_DURATION_MS = 200

interface InspectorWithChatContainerProps {
  inspectorNodeId: string | null
  chatNodeId: string | null
  onCloseInspector: () => void
  onCloseChat: () => void
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

export const InspectorWithChatContainer: FC<InspectorWithChatContainerProps> = memo(({
  inspectorNodeId,
  chatNodeId,
  onCloseInspector,
  onCloseChat,
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
}) => {
  const { t } = useTranslation()
  const isOpen = Boolean(inspectorNodeId || chatNodeId)
  const hasInspector = Boolean(inspectorNodeId)
  const hasChat = Boolean(chatNodeId)
  const [renderedChatNodeId, setRenderedChatNodeId] = useState<string | null>(null)
  const [chatVisible, setChatVisible] = useState(false)

  const handleCloseBoth = useCallback(() => {
    onCloseChat()
    onCloseInspector()
  }, [onCloseChat, onCloseInspector])

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return

      const target = event.target
      if (!(target instanceof HTMLElement)) {
        handleCloseBoth()
        return
      }

      const isEditable =
        target.isContentEditable ||
        target.getAttribute('contenteditable') === 'true' ||
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT'

      if (!isEditable) {
        handleCloseBoth()
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [handleCloseBoth, isOpen])

  useEffect(() => {
    let frame: number | null = null
    let timeout: ReturnType<typeof setTimeout> | null = null

    if (chatNodeId) {
      setRenderedChatNodeId(chatNodeId)
      frame = window.requestAnimationFrame(() => {
        setChatVisible(true)
      })
    } else {
      setChatVisible(false)
      timeout = setTimeout(() => {
        setRenderedChatNodeId(null)
      }, CHAT_TRANSITION_DURATION_MS)
    }

    return () => {
      if (frame !== null) {
        window.cancelAnimationFrame(frame)
      }
      if (timeout !== null) {
        clearTimeout(timeout)
      }
    }
  }, [chatNodeId])

  if (!isOpen) return null
  if (typeof document === 'undefined') return null

  const showInspectorOnMobile = hasInspector && !hasChat
  const hasRenderedChat = Boolean(renderedChatNodeId)
  const shouldShiftInspector = hasInspector && hasRenderedChat && chatVisible
  const inspectorDesktopWidthClass = 'md:w-[560px]'

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/40 px-4 py-6 md:py-8">
      <button
        type="button"
        aria-label={t('common.close')}
        className="absolute inset-0"
        onClick={handleCloseBoth}
      />
      <div className="relative z-10 flex w-full max-w-[1120px] items-start justify-center gap-3 md:gap-4">
        {hasInspector ? (
          <div
            data-testid="inspector-panel"
            className={`flex h-[85vh] min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl transition-transform duration-200 ease-out ${
              `w-full ${inspectorDesktopWidthClass} md:shrink-0`
            } ${shouldShiftInspector ? 'md:-translate-x-3' : 'md:translate-x-0'}`}
          >
            <header className="flex items-center justify-between border-b border-slate-200 p-4">
              <h2 className="text-sm font-semibold text-slate-800">
                {summaryTitle || t('inspector.title')}
              </h2>
              <button
                type="button"
                onClick={onCloseInspector}
                className="rounded-full p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
                aria-label={t('common.close')}
              >
                ✕
              </button>
            </header>

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
        ) : null}

        {hasRenderedChat && renderedChatNodeId ? (
          <div
            data-testid="node-chat-panel"
            className={`flex h-[85vh] min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl transition-[transform,opacity] duration-200 ease-out ${
              hasInspector
                ? `w-full md:w-[460px] md:shrink-0 ${
                    chatVisible
                      ? 'opacity-100 md:translate-x-0'
                      : 'opacity-0 md:translate-x-10'
                  } ${showInspectorOnMobile ? 'hidden' : 'hidden md:flex'}`
                : `w-full md:max-w-2xl ${chatVisible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-10'}`
            }`}
          >
            <ChatCard nodeId={renderedChatNodeId} onClose={onCloseChat} />
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  )
})

InspectorWithChatContainer.displayName = 'InspectorWithChatContainer'
