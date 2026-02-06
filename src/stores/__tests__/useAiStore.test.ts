import { beforeEach, describe, expect, it } from 'vitest'

import { AiError } from '@/lib/ai/types'
import { useAiStore } from '@/stores/useAiStore'

const LIFECYCLE_ID = 'node-lifecycle'
const ERROR_ID = 'node-error'
const CLEAR_ID = 'node-clear'
const NODE_A = 'node-a'
const NODE_B = 'node-b'

const resetNodes = () => {
  ;[LIFECYCLE_ID, ERROR_ID, CLEAR_ID, NODE_A, NODE_B].forEach((id) => {
    useAiStore.getState().clearNode(id)
  })
}

describe('useAiStore', () => {
  beforeEach(() => {
    resetNodes()
  })

  it('tracks the streaming lifecycle for a single node', () => {
    useAiStore.getState().startStreaming(LIFECYCLE_ID, 'summarize')

    let state = useAiStore.getState()
    expect(state.isLoading[LIFECYCLE_ID]).toBe(true)
    expect(state.streamingText[LIFECYCLE_ID]).toBe('')
    expect(state.error[LIFECYCLE_ID]).toBeNull()
    expect(state.currentAction[LIFECYCLE_ID]).toBe('summarize')

    useAiStore.getState().appendText(LIFECYCLE_ID, 'hello')
    useAiStore.getState().appendText(LIFECYCLE_ID, ' world')

    state = useAiStore.getState()
    expect(state.streamingText[LIFECYCLE_ID]).toBe('hello world')

    useAiStore.getState().finishStreaming(LIFECYCLE_ID)
    expect(useAiStore.getState().isLoading[LIFECYCLE_ID]).toBe(false)
  })

  it('setError records the failure and stops loading', () => {
    useAiStore.getState().startStreaming(ERROR_ID, 'critique')
    const error = new AiError('boom', 'openai')

    useAiStore.getState().setError(ERROR_ID, error)
    const state = useAiStore.getState()

    expect(state.isLoading[ERROR_ID]).toBe(false)
    expect(state.error[ERROR_ID]).toBe(error)
  })

  it('clearNode resets all per-node state', () => {
    useAiStore.getState().startStreaming(CLEAR_ID, 'questions')
    useAiStore.getState().appendText(CLEAR_ID, 'draft text')
    const error = new AiError('oops', 'gemini')
    useAiStore.getState().setError(CLEAR_ID, error)

    useAiStore.getState().clearNode(CLEAR_ID)
    const state = useAiStore.getState()

    expect(state.isLoading[CLEAR_ID]).toBe(false)
    expect(state.streamingText[CLEAR_ID]).toBe('')
    expect(state.error[CLEAR_ID]).toBeNull()
    expect(state.currentAction[CLEAR_ID]).toBeNull()
  })

  it('keeps nodes isolated', () => {
    useAiStore.getState().startStreaming(NODE_A, 'summarize')
    useAiStore.getState().appendText(NODE_A, 'alpha')

    useAiStore.getState().startStreaming(NODE_B, 'expand')
    useAiStore.getState().appendText(NODE_B, 'bravo')

    const state = useAiStore.getState()
    expect(state.streamingText[NODE_A]).toBe('alpha')
    expect(state.streamingText[NODE_B]).toBe('bravo')
  })
})
