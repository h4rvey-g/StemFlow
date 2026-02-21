import { describe, expect, it } from 'vitest'

import type {
  AiAction,
  AiMessage,
  AiModel,
  AiProvider,
  AiRequestOptions,
  AiResponse,
  AiStreamChunk,
} from '@/lib/ai/types'

import { AiError } from '@/lib/ai/types'

describe('ai service types', () => {
  it('exports expected provider/model unions', () => {
    expectTypeOf<AiProvider>().toEqualTypeOf<'gemini' | 'openai' | 'openai-compatible' | 'anthropic'>()

    expectTypeOf<AiModel>().toEqualTypeOf<
      | 'gemini-2.5-pro'
      | 'gemini-3-pro-preview'
      | 'gpt-4o'
      | 'gpt-4-turbo'
      | 'gpt-3.5-turbo'
      | 'claude-3-5-sonnet-20241022'
      | 'claude-3-haiku-20240307'
    >()
  })

  it('exports expected request/response interfaces', () => {
    expectTypeOf<AiMessage>().toMatchTypeOf<{
      role: 'system' | 'user' | 'assistant'
      content:
        | string
        | Array<
            | { type: 'text'; text: string }
            | { type: 'image'; dataUrl: string; mimeType?: string }
          >
    }>()

    expectTypeOf<AiRequestOptions>().toMatchTypeOf<{
      provider: AiProvider
      model: string
      messages: AiMessage[]
      temperature?: number
      maxTokens?: number
      stream?: boolean
    }>()

    expectTypeOf<AiResponse>().toMatchTypeOf<{
      text: string
      model: string
      finishReason: string
    }>()

    expectTypeOf<AiStreamChunk>().toMatchTypeOf<{
      text: string
      done: boolean
    }>()
  })

  it('exports expected action union', () => {
    expectTypeOf<AiAction>().toEqualTypeOf<
      'summarize' | 'suggest-mechanism' | 'critique' | 'expand' | 'questions' | 'translation'
    >()
  })

  it('AiError extends Error with provider and code', () => {
    const err = new AiError('boom', 'openai', 'bad_request')
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('AiError')
    expect(err.provider).toBe('openai')
    expect(err.code).toBe('bad_request')
  })
})
