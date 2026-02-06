import type { AiMessage } from '@/lib/ai/types'

import {
  OPENAI_API_URL,
  SUPPORTED_OPENAI_MODELS,
  createOpenAIRequest,
  parseOpenAIResponse,
} from '../openai'

const sampleMessages: AiMessage[] = [
  { role: 'system', content: 'You are precise' },
  { role: 'user', content: 'Explain OMV' },
  { role: 'assistant', content: 'Here is a recap.' },
]

describe('createOpenAIRequest', () => {
  it('builds a chat completion request with minimal fields', () => {
    const { url, body, headers } = createOpenAIRequest({
      provider: 'openai',
      model: 'gpt-4o',
      messages: sampleMessages,
    })

    expect(url).toBe(`${OPENAI_API_URL}/chat/completions`)
    expect(body).toEqual({
      model: 'gpt-4o',
      messages: sampleMessages,
    })
    expect(headers).toEqual({ 'Content-Type': 'application/json' })
  })

  it('includes optional temperature, max_tokens, and stream flags', () => {
    const { body } = createOpenAIRequest({
      provider: 'openai',
      model: 'gpt-4-turbo',
      messages: sampleMessages,
      temperature: 0.25,
      maxTokens: 250,
      stream: true,
    })

    expect(body).toMatchObject({
      model: 'gpt-4-turbo',
      temperature: 0.25,
      max_tokens: 250,
      stream: true,
    })
  })

  it('only publishes supported models', () => {
    expect(SUPPORTED_OPENAI_MODELS).toStrictEqual([
      'gpt-4o',
      'gpt-4-turbo',
      'gpt-3.5-turbo',
    ])
  })
})

describe('parseOpenAIResponse', () => {
  it('extracts assistant content, finish reason, and model', () => {
    const result = parseOpenAIResponse({
      model: 'gpt-4o',
      choices: [
        {
          message: { role: 'assistant', content: 'Insightful summary.' },
          finish_reason: 'length',
        },
      ],
    })

    expect(result).toEqual({
      text: 'Insightful summary.',
      finishReason: 'length',
      model: 'gpt-4o',
    })
  })

  it('falls back to default finish reason when missing', () => {
    const result = parseOpenAIResponse({
      choices: [
        {
          message: { role: 'assistant', content: 'More context.' },
        },
      ],
    })

    expect(result.finishReason).toBe('stop')
  })

  it('handles malformed responses defensively', () => {
    expect(parseOpenAIResponse({})).toEqual({
      text: '',
      finishReason: 'error',
      model: 'unknown',
    })
  })
})
