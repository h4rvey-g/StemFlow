import type { AiMessage } from '@/lib/ai/types'

import {
  ANTHROPIC_API_URL,
  createAnthropicRequest,
  parseAnthropicResponse,
} from '../anthropic'

const sampleMessages: AiMessage[] = [
  { role: 'system', content: 'Stay factual' },
  { role: 'user', content: 'Summarize the experiment' },
  { role: 'assistant', content: 'Initial hypothesis noted.' },
]

describe('createAnthropicRequest', () => {
  it('targets the /messages endpoint and maps roles correctly', () => {
    const { url, body, headers } = createAnthropicRequest({
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-20241022',
      messages: sampleMessages,
      temperature: 0.3,
      maxTokens: 512,
      stream: true,
    })

    expect(url).toBe(`${ANTHROPIC_API_URL}/messages`)
    expect(body).toEqual({
      model: 'claude-3-5-sonnet-20241022',
      system: 'Stay factual',
      messages: [
        { role: 'user', content: 'Summarize the experiment' },
        { role: 'assistant', content: 'Initial hypothesis noted.' },
      ],
      max_tokens: 512,
      temperature: 0.3,
      stream: true,
    })
    expect(headers).toEqual({
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
    })
  })

  it('aggregates multiple system messages with double newlines and omits max_tokens when not provided', () => {
    const { body } = createAnthropicRequest({
      provider: 'anthropic',
      model: 'claude-3-haiku-20240307',
      messages: [
        { role: 'system', content: 'Follow safety guidelines' },
        { role: 'system', content: 'Only return concise answers' },
        { role: 'user', content: 'List the key findings' },
      ],
    })

    expect(body.system).toBe('Follow safety guidelines\n\nOnly return concise answers')
    expect(body.max_tokens).toBeUndefined()
    expect(body.messages).toEqual([{ role: 'user', content: 'List the key findings' }])
  })
})

describe('parseAnthropicResponse', () => {
  it('joins content blocks, returns stop reason, and honors the model', () => {
    const response = parseAnthropicResponse({
      model: 'claude-3-haiku-20240307',
      content: [{ text: 'Hello' }, { text: ' world' }],
      stop_reason: 'length',
    })

    expect(response).toEqual({
      text: 'Hello world',
      finishReason: 'length',
      model: 'claude-3-haiku-20240307',
    })
  })

  it('defensively handles missing fields by providing safe defaults', () => {
    expect(parseAnthropicResponse({})).toEqual({
      text: '',
      finishReason: 'stop',
      model: 'unknown',
    })
  })
})
