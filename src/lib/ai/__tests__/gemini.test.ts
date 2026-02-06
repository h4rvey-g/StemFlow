import type { AiMessage } from '@/lib/ai/types'

import { GEMINI_API_URL, createGeminiRequest, parseGeminiResponse } from '../gemini'

const sampleMessages: AiMessage[] = [
  { role: 'system', content: 'Be concise' },
  { role: 'user', content: 'Summarize the data' },
  { role: 'assistant', content: 'Here are my notes.' },
]

describe('createGeminiRequest', () => {
  it('builds the non-stream URL and maps roles to contents', () => {
    const { url, body, headers } = createGeminiRequest({
      provider: 'gemini',
      model: 'gemini-2.5-pro',
      messages: sampleMessages,
    })

    expect(url).toBe(`${GEMINI_API_URL}/models/gemini-2.5-pro:generateContent`)
    expect(body).toEqual({
      contents: [
        { role: 'user', parts: [{ text: 'Be concise' }] },
        { role: 'user', parts: [{ text: 'Summarize the data' }] },
        { role: 'model', parts: [{ text: 'Here are my notes.' }] },
      ],
      generationConfig: {},
    })
    expect(headers).toEqual({ 'Content-Type': 'application/json' })
  })

  it('uses the streaming endpoint when requested', () => {
    const { url } = createGeminiRequest({
      provider: 'gemini',
      model: 'gemini-3-pro-preview',
      messages: sampleMessages,
      stream: true,
    })

    expect(url).toBe(
      `${GEMINI_API_URL}/models/gemini-3-pro-preview:streamGenerateContent?alt=sse`
    )
  })

  it('includes generationConfig when temperature or maxTokens are provided', () => {
    const { body } = createGeminiRequest({
      provider: 'gemini',
      model: 'gemini-2.5-pro',
      messages: sampleMessages,
      temperature: 0.7,
      maxTokens: 500,
    })

    expect(body.generationConfig).toEqual({
      temperature: 0.7,
      maxOutputTokens: 500,
    })
  })
})

describe('parseGeminiResponse', () => {
  it('joins text parts, returns finishReason, and honors model when present', () => {
    const response = parseGeminiResponse({
      model: 'gemini-3-pro-preview',
      candidates: [
        {
          metadata: { finishReason: 'length' },
          content: { parts: [{ text: 'Hello' }, { text: ' world' }] },
        },
      ],
    })

    expect(response).toEqual({
      text: 'Hello world',
      finishReason: 'length',
      model: 'gemini-3-pro-preview',
    })
  })

  it('defensively handles missing or empty candidates', () => {
    expect(parseGeminiResponse({})).toEqual({
      text: '',
      finishReason: 'stop',
      model: 'unknown',
    })
  })
})
