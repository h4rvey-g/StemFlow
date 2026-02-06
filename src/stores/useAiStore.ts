import { create } from 'zustand'

import type { AiAction, AiError } from '@/lib/ai/types'

interface AiNodeState {
  isLoading: Record<string, boolean>
  streamingText: Record<string, string>
  error: Record<string, AiError | null>
  currentAction: Record<string, AiAction | null>
}

interface AiNodeActions {
  startStreaming: (nodeId: string, action: AiAction) => void
  appendText: (nodeId: string, text: string) => void
  finishStreaming: (nodeId: string) => void
  setError: (nodeId: string, error: AiError | null) => void
  clearNode: (nodeId: string) => void
}

type AiStore = AiNodeState & AiNodeActions

export const useAiStore = create<AiStore>((set) => ({
  isLoading: {},
  streamingText: {},
  error: {},
  currentAction: {},

  startStreaming: (nodeId, action) => {
    set((state) => ({
      isLoading: { ...state.isLoading, [nodeId]: true },
      streamingText: { ...state.streamingText, [nodeId]: '' },
      error: { ...state.error, [nodeId]: null },
      currentAction: { ...state.currentAction, [nodeId]: action },
    }))
  },

  appendText: (nodeId, text) => {
    set((state) => ({
      streamingText: {
        ...state.streamingText,
        [nodeId]: `${state.streamingText[nodeId] ?? ''}${text}`,
      },
    }))
  },

  finishStreaming: (nodeId) => {
    set((state) => ({
      isLoading: { ...state.isLoading, [nodeId]: false },
    }))
  },

  setError: (nodeId, error) => {
    set((state) => ({
      error: { ...state.error, [nodeId]: error },
      isLoading: { ...state.isLoading, [nodeId]: false },
    }))
  },

  clearNode: (nodeId) => {
    set((state) => {
      const isLoading = { ...state.isLoading, [nodeId]: false }
      const streamingText = { ...state.streamingText, [nodeId]: '' }
      const error = { ...state.error, [nodeId]: null }
      const currentAction = { ...state.currentAction, [nodeId]: null }

      return {
        isLoading,
        streamingText,
        error,
        currentAction,
      }
    })
  },
}))
