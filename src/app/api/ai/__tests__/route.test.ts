import { beforeEach, describe, expect, it, vi } from 'vitest'

import { POST } from '@/app/api/ai/[provider]/route'

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

  it('non-stream openai returns normalized AiResponse json', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          model: 'gpt-4o',
          choices: [{ message: { content: 'hi' }, finish_reason: 'stop' }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    )

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
      model: 'gpt-4o',
      finishReason: 'stop',
    })
  })

  it('non-stream openai-compatible accepts gemini-style payloads from compatible gateways', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          model: 'gemini-2.5-flash',
          candidates: [
            {
              content: {
                parts: [{ text: '4' }],
              },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    )

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
      model: 'gemini-2.5-flash',
      finishReason: 'stop',
    })
  })

  it('stream gemini passes through SSE body', async () => {
    const upstream = new Response(streamFromStrings(['data: {"x":1}\n\n']), {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    })

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(upstream)

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
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    const calledUrl = String(fetchSpy.mock.calls[0]?.[0])
    expect(calledUrl).toContain('generativelanguage.googleapis.com')
    expect(calledUrl).toContain('key=gk-test')

    // Ensure body is readable.
    const reader = res.body?.getReader()
    expect(reader).toBeTruthy()
    const first = await reader!.read()
    expect(first.done).toBe(false)
  })

  it('propagates upstream error as json error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('bad', { status: 401 }))

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
