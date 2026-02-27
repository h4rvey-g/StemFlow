import { beforeEach, describe, expect, it, vi } from 'vitest'

import { POST } from '@/app/api/ai/chat/route'

const baseRequestBody = {
  provider: 'openai' as const,
  apiKey: 'sk-test',
  model: 'gpt-4o',
  nodeId: 'node-1',
  nodeType: 'OBSERVATION',
  message: 'Please improve this node.',
  nodeContent: 'Original node content',
  ancestry: 'Parent node: prior observation',
}

describe('/api/ai/chat route', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns 400 on invalid JSON body', async () => {
    const res = await POST(
      new Request('http://localhost/api/ai/chat', {
        method: 'POST',
        body: 'not-json',
      })
    )

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid JSON body' })
  })

  it('returns 400 when required fields are missing', async () => {
    const res = await POST(
      new Request('http://localhost/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({
          provider: 'openai',
          apiKey: 'sk-test',
          model: 'gpt-4o',
        }),
      })
    )

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'nodeId is required' })
  })

  it('returns 400 when ancestry is missing', async () => {
    const res = await POST(
      new Request('http://localhost/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({
          ...baseRequestBody,
          ancestry: undefined,
        }),
      })
    )

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'ancestry is required' })
  })

  it('builds chat prompts and returns validated ChatResponse', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          model: 'gpt-4o',
          choices: [
            {
              message: {
                content: JSON.stringify({
                  mode: 'proposal',
                  proposal: {
                    title: 'Refine node wording',
                    content: 'Improved scientific node content',
                    rationale: 'Improves clarity and experimental precision',
                    confidence: 0.92,
                    diffSummary: 'Clarified hypothesis and endpoint',
                  },
                }),
              },
              finish_reason: 'stop',
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    )

    const res = await POST(
      new Request('http://localhost/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({
          ...baseRequestBody,
          chatSystemPrompt: 'System {{ignored}} prompt',
          chatUserMessageTemplate: 'Node={{nodeId}}\nType={{nodeType}}\nMsg={{message}}\nAnc={{ancestry}}',
        }),
      })
    )

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      mode: 'proposal',
      proposal: {
        title: 'Refine node wording',
        content: 'Improved scientific node content',
        rationale: 'Improves clarity and experimental precision',
        confidence: 0.92,
        diffSummary: 'Clarified hypothesis and endpoint',
      },
    })

    const fetchCall = fetchSpy.mock.calls[0]
    expect(String(fetchCall?.[0])).toContain('/chat/completions')

    const requestInit = fetchCall?.[1] as RequestInit
    const payload = JSON.parse(String(requestInit.body)) as {
      messages: Array<{ role: string; content: string }>
      response_format?: { type?: string }
    }

    expect(payload.messages[0]).toEqual({ role: 'system', content: 'System {{ignored}} prompt' })
    expect(payload.messages[1].content).toContain('Node=node-1')
    expect(payload.messages[1].content).toContain('Type=OBSERVATION')
    expect(payload.messages[1].content).toContain('Msg=Please improve this node.')
    expect(payload.messages[1].content).toContain('Anc=Parent node: prior observation')
    expect(payload.response_format?.type).toBe('json_schema')
  })

  it('supports gemini provider and enforces json mime type', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          model: 'gemini-2.5-pro',
          candidates: [
            {
              content: {
                parts: [{ text: '{"mode":"answer","answerText":"Looks plausible."}' }],
              },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    )

    const res = await POST(
      new Request('http://localhost/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({
          ...baseRequestBody,
          provider: 'gemini',
          apiKey: 'gk-test',
          model: 'gemini-2.5-pro',
        }),
      })
    )

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ mode: 'answer', answerText: 'Looks plausible.' })

    const fetchCall = fetchSpy.mock.calls[0]
    expect(String(fetchCall?.[0])).toContain('generativelanguage.googleapis.com')
    expect(String(fetchCall?.[0])).toContain('key=gk-test')

    const requestInit = fetchCall?.[1] as RequestInit
    const payload = JSON.parse(String(requestInit.body)) as {
      generationConfig?: { responseMimeType?: string }
    }
    expect(payload.generationConfig?.responseMimeType).toBe('application/json')
  })

  it('propagates upstream non-2xx JSON error payload', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Invalid key' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      })
    )

    const res = await POST(
      new Request('http://localhost/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify(baseRequestBody),
      })
    )

    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid key' })
  })

  it('returns 422 when model output is not valid JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          model: 'gpt-4o',
          choices: [{ message: { content: 'plain text output' }, finish_reason: 'stop' }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    )

    const res = await POST(
      new Request('http://localhost/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify(baseRequestBody),
      })
    )

    expect(res.status).toBe(422)
    await expect(res.json()).resolves.toEqual({ error: 'AI response is not valid JSON' })
  })

  it('returns 422 when parsed JSON fails ChatResponse validation', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          model: 'gpt-4o',
          choices: [
            {
              message: {
                content: JSON.stringify({
                  mode: 'proposal',
                  proposal: {
                    content: 'Missing title and rationale',
                  },
                }),
              },
              finish_reason: 'stop',
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    )

    const res = await POST(
      new Request('http://localhost/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify(baseRequestBody),
      })
    )

    expect(res.status).toBe(422)
    await expect(res.json()).resolves.toMatchObject({
      error: expect.stringContaining('Invalid chat response'),
      issues: expect.any(Array),
    })
  })
})
