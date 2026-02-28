import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/ai/[provider]/route'
vi.mock('ai', async () => {
  const actual = await vi.importActual('ai')
  return {
    ...actual,
    generateText: vi.fn(),
    streamText: vi.fn(),
  }
})

const streamFromStrings = (chunks: string[]) => {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)))
      controller.close()
    },
  })
}

describe('/api/ai/[provider] route', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns 400 on invalid provider', async () => {
    const res = await POST(
      new Request('http://localhost/api/ai/nope', { method: 'POST', body: '{}' }),
      { params: { provider: 'nope' } }
    )

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid provider' })
  })

  it('returns 400 on invalid json', async () => {
    const res = await POST(
      new Request('http://localhost/api/ai/openai', { method: 'POST', body: 'not-json' }),
      { params: { provider: 'openai' } }
    )

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid JSON body' })
  })

  it('returns 400 when apiKey missing', async () => {
    const res = await POST(
      new Request('http://localhost/api/ai/openai', {
        method: 'POST',
        body: JSON.stringify({ model: 'gpt-4o', messages: [] }),
      }),
      { params: { provider: 'openai' } }
    )

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'apiKey is required' })
  })

  it('non-stream openai returns text json', async () => {
    const { generateText } = await import('ai')
    vi.mocked(generateText).mockResolvedValueOnce({
      text: 'hi',
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    } as any)

    const res = await POST(
      new Request('http://localhost/api/ai/openai', {
        method: 'POST',
        body: JSON.stringify({
          apiKey: 'sk-test',
          model: 'gpt-4o',
          messages: [{ role: 'user', content: 'hello' }],
          stream: false,
        }),
      }),
      { params: { provider: 'openai' } }
    )

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      text: 'hi',
    })
  })

  it('non-stream openai-compatible returns text json', async () => {
    const { generateText } = await import('ai')
    vi.mocked(generateText).mockResolvedValueOnce({
      text: '4',
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    } as any)

    const res = await POST(
      new Request('http://localhost/api/ai/openai-compatible', {
        method: 'POST',
        body: JSON.stringify({
          apiKey: 'sk-test',
          model: 'gemini-2.5-flash',
          baseUrl: 'https://openrouter.ai/api/v1',
          messages: [{ role: 'user', content: 'grade this' }],
          stream: false,
        }),
      }),
      { params: { provider: 'openai-compatible' } }
    )

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      text: '4',
    })
  })

  it('stream gemini returns text stream', async () => {
    const { streamText } = await import('ai')
    const mockStream = {
      toTextStreamResponse: () => new Response(streamFromStrings(['hi']), {
        status: 200,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      }),
    }
    vi.mocked(streamText).mockReturnValueOnce(mockStream as any)

    const res = await POST(
      new Request('http://localhost/api/ai/gemini', {
        method: 'POST',
        body: JSON.stringify({
          apiKey: 'gk-test',
          model: 'gemini-2.5-pro',
          messages: [{ role: 'user', content: 'hello' }],
          stream: true,
        }),
      }),
      { params: { provider: 'gemini' } }
    )

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/plain')

    // Ensure body is readable.
    const reader = res.body?.getReader()
    expect(reader).toBeTruthy()
    const first = await reader!.read()
    expect(first.done).toBe(false)
  })

  it('propagates upstream error as json error', async () => {
    const { generateText, APICallError } = await import('ai')
    const error = new APICallError({
      message: 'bad',
      url: 'https://api.openai.com/v1/chat/completions',
      requestBodyValues: {},
      statusCode: 401,
      responseBody: 'bad',
    })
    vi.mocked(generateText).mockRejectedValueOnce(error)

    const res = await POST(
      new Request('http://localhost/api/ai/openai', {
        method: 'POST',
        body: JSON.stringify({
          apiKey: 'sk-test',
          model: 'gpt-4o',
          messages: [{ role: 'user', content: 'hello' }],
          stream: false,
        }),
      }),
      { params: { provider: 'openai' } }
    )

    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: 'bad' })
  })
})
