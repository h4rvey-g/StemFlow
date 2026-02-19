"use client"

import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { AiAction } from '@/lib/ai/types'
import { useAi } from '@/hooks/useAi'
import { StreamingText } from '@/components/ui/StreamingText'
import { useStore } from '@/stores/useStore'
import { createRightwardPosition } from '@/lib/node-layout'
import type { OMVNode, OMVEdge, NodeType } from '@/types/nodes'

interface InspectorAiActionsProps {
  nodeId: string
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

export const InspectorAiActions = ({ nodeId }: InspectorAiActionsProps) => {
  const { t } = useTranslation()
  const { isLoading, streamingText, error, executeAction, cancel } = useAi(nodeId)
  const [activeAction, setActiveAction] = useState<AiAction | null>(null)
  
  const addNode = useStore((s) => s.addNode)
  const addEdge = useStore((s) => s.addEdge)
  const nodes = useStore((s) => s.nodes)

  const sourceNode = nodes.find((n) => n.id === nodeId)
  const sourceType = sourceNode?.type ?? 'OBSERVATION'

  const runAction = async (action: AiAction) => {
    setActiveAction(action)
    await executeAction(action, undefined, { createNodeOnComplete: false })
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

      {(streamingText || isLoading) && (
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
      ) : streamingText.trim() ? (
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
