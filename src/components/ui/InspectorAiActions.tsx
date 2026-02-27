"use client"

import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { AiAction } from '@/lib/ai/types'
import { useAi } from '@/hooks/useAi'
import { StreamingText } from '@/components/ui/StreamingText'
import { useStore } from '@/stores/useStore'
import { createRightwardPosition } from '@/lib/node-layout'
import type { OMVNode, OMVEdge, NodeType } from '@/types/nodes'

type TranslationLanguage = 'zh-CN' | 'en'

type InspectorAction = AiAction

interface InspectorAiActionsProps {
  nodeId: string
}

const ACTIONS: InspectorAction[] = ['summarize', 'suggest-mechanism', 'critique', 'expand', 'questions', 'translation', 'chat']

const ACTION_TRANSLATION_KEYS: Record<InspectorAction, string> = {
  summarize: 'summarize',
  'suggest-mechanism': 'suggestMechanism',
  critique: 'critique',
  expand: 'expand',
  questions: 'generateQuestions',
  translation: 'translation',
  chat: 'chat',
}

const getActionTranslationKey = (action: InspectorAction, nodeType: NodeType) =>
  action === 'suggest-mechanism' && nodeType === 'MECHANISM'
    ? 'suggestValidation'
    : ACTION_TRANSLATION_KEYS[action]

export const InspectorAiActions = ({ nodeId }: InspectorAiActionsProps) => {
  const { t } = useTranslation()
  const { isLoading, streamingText, error, executeAction, translateNodeContent, cancel } = useAi(nodeId)
  const [activeAction, setActiveAction] = useState<InspectorAction | null>(null)
  const [translationLanguage, setTranslationLanguage] = useState<TranslationLanguage>('zh-CN')
  const [showTranslationLanguagePicker, setShowTranslationLanguagePicker] = useState(false)
  
  const addNode = useStore((s) => s.addNode)
  const addEdge = useStore((s) => s.addEdge)
  const nodes = useStore((s) => s.nodes)

  const sourceNode = nodes.find((n) => n.id === nodeId)
  const sourceType = sourceNode?.type ?? 'OBSERVATION'

  const runAction = async (action: InspectorAction) => {
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
    if (!source || source.type === 'GHOST') return

    const text = streamingText.trim()
    if (!text) return

    const nextType: Exclude<NodeType, 'GHOST'> =
      activeAction === 'suggest-mechanism'
        ? source.type === 'MECHANISM'
          ? 'VALIDATION'
          : source.type === 'OBSERVATION'
            ? 'MECHANISM'
            : source.type
        : source.type

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
  }

  return (
    <div className="mt-4 space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
        {t('inspector.ai.title')}
      </h3>

      <div className="grid grid-cols-2 gap-2">
        {ACTIONS.map((action) => (
          <button
            key={action}
            type="button"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 disabled:opacity-50"
            onClick={() => runAction(action)}
            disabled={isLoading}
          >
            {t(`popover.actions.${getActionTranslationKey(action, sourceType)}`, action)}
          </button>
        ))}
      </div>

      {showTranslationLanguagePicker ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
          <label className="mb-1 block text-xs font-medium text-slate-700" htmlFor={`inspector-translation-language-${nodeId}`}>
            {t('popover.translation.languageLabel')}
          </label>
          <div className="flex items-center gap-2">
            <select
              id={`inspector-translation-language-${nodeId}`}
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

      {activeAction !== 'translation' && (streamingText || isLoading) && (
        <StreamingText text={streamingText} isLoading={isLoading} />
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error.message}
        </div>
      )}

      {isLoading ? (
        <button
          type="button"
          className="w-full rounded-md bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
          onClick={cancel}
        >
          {t('common.cancel')}
        </button>
      ) : streamingText.trim() && activeAction !== 'translation' ? (
        <button
          type="button"
          className="w-full rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
          onClick={applyResult}
        >
          {t('common.apply')}
        </button>
      ) : null}

      {activeAction && (
        <div className="text-xs text-slate-500">
          {t('inspector.ai.active', { 
            action: t(`popover.actions.${getActionTranslationKey(activeAction, sourceType)}`) 
          })}
        </div>
      )}
    </div>
  )
}
