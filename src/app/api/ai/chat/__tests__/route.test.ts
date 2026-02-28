import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'

/**
 * Mock the `ai` module synchronously to avoid bun+vitest async-factory deadlock.
 *
 * Rules enforced here:
 *  1. No `async` factory — any `await import()` / `vi.importActual()` inside
 *     vi.mock causes an unresolvable circular wait in bun's module runner.
 *  2. We define a minimal inline `APICallError` that satisfies the shape used
 *     by `handleSdkError` in route.ts.  Both the route import and test import
 *     resolve to the same class via this mock, so `instanceof` works correctly.
 *  3. `generateObject` / `streamObject` are plain `vi.fn()` stubs.
 */
vi.mock('ai', () => {
  class APICallError extends Error {
    statusCode?: number
    responseBody?: string
    isRetryable: boolean
    url: string
    requestBodyValues: unknown

    constructor({
      message,
      url = '',
      requestBodyValues = {},
      statusCode,
      responseBody,
      isRetryable = false,
    }: {
      message: string
      url?: string
      requestBodyValues?: unknown
      statusCode?: number
      responseBody?: string
      isRetryable?: boolean
    }) {
      super(message)
      this.name = 'APICallError'
      this.url = url
      this.requestBodyValues = requestBodyValues
      this.statusCode = statusCode
      this.responseBody = responseBody
      this.isRetryable = isRetryable
    }
  }

  return {
    APICallError,
    generateObject: vi.fn(),
    streamObject: vi.fn(),
  }
})

import { APICallError, generateObject } from 'ai'
import { POST } from '@/app/api/ai/chat/route'

// Cast mocked functions – vi.mocked() is unavailable in this bun+vitest build.
// vi.mock above provides vi.fn() at runtime, so the cast is safe.
const genObjMock = generateObject as unknown as Mock

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

const makeHistoryItem = (role: 'user' | 'assistant', content: string) => ({ role, content })

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal resolved value for a mocked generateObject call. */
const makeObjectResult = (chatResponse: Record<string, unknown>) =>
  ({ object: chatResponse } as Awaited<ReturnType<typeof generateObject>>)

/** Create an APICallError (using the mocked class) with the given HTTP status. */
const makeApiCallError = (statusCode: number, responseBody: Record<string, unknown>) =>
  new APICallError({
    message: `API error ${statusCode}`,
    url: 'https://api.openai.com/v1/chat/completions',
    requestBodyValues: {},
    statusCode,
    responseBody: JSON.stringify(responseBody),
    isRetryable: false,
  })

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('/api/ai/chat route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // --- Input validation (no AI calls needed) --------------------------------

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

  it('rejects invalid history shape', async () => {
    const res = await POST(
      new Request('http://localhost/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({
          ...baseRequestBody,
          history: 'invalid-history',
        }),
      })
    )

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'history must be an array' })
  })

  it('rejects invalid history role', async () => {
    const res = await POST(
      new Request('http://localhost/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({
          ...baseRequestBody,
          history: [{ role: 'system', content: 'forbidden' }],
        }),
      })
    )

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'history roles must be user or assistant' })
  })

  // --- Happy-path (non-streaming) -------------------------------------------

  it('builds chat prompts and returns validated ChatResponse', async () => {
    const proposalJson = {
      mode: 'proposal',
      proposal: {
        title: 'Refine node wording',
        content: 'Improved scientific node content',
        rationale: 'Improves clarity and experimental precision',
        confidence: 0.92,
        diffSummary: 'Clarified hypothesis and endpoint',
      },
    }

    genObjMock.mockResolvedValueOnce(makeObjectResult(proposalJson))

    const res = await POST(
      new Request('http://localhost/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({
          ...baseRequestBody,
          chatSystemPrompt: 'System {{ignored}} prompt',
          chatUserMessageTemplate:
            'Node={{nodeId}}\nType={{nodeType}}\nMsg={{message}}\nAnc={{ancestry}}',
        }),
      })
    )

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual(proposalJson)

    // Verify prompt interpolation was applied when calling generateObject
    const callArgs = genObjMock.mock.calls[0]?.[0] as
      | { messages?: Array<{ role: string; content: string }> }
      | undefined
    expect(callArgs?.messages?.[0]).toEqual({
      role: 'system',
      content: 'System {{ignored}} prompt',
    })
    expect(callArgs?.messages?.[1]?.content).toContain('Node=node-1')
    expect(callArgs?.messages?.[1]?.content).toContain('Type=OBSERVATION')
    expect(callArgs?.messages?.[1]?.content).toContain('Msg=Please improve this node.')
    expect(callArgs?.messages?.[1]?.content).toContain('Anc=Parent node: prior observation')
  })

  it('accepts history and includes it in sdkMessages order', async () => {
    genObjMock.mockResolvedValueOnce(makeObjectResult({ mode: 'answer', answerText: 'ok' }))

    const history = [
      makeHistoryItem('user', 'Earlier user question'),
      makeHistoryItem('assistant', 'Earlier assistant response'),
    ]

    const res = await POST(
      new Request('http://localhost/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({
          ...baseRequestBody,
          history,
        }),
      })
    )

    expect(res.status).toBe(200)

    const callArgs = genObjMock.mock.calls[0]?.[0] as
      | { messages?: Array<{ role: string; content: string }> }
      | undefined

    expect(callArgs?.messages).toBeDefined()
    expect(callArgs?.messages?.[0]).toEqual(expect.objectContaining({ role: 'system' }))
    expect(callArgs?.messages?.[1]).toEqual(history[0])
    expect(callArgs?.messages?.[2]).toEqual(history[1])
    expect(callArgs?.messages?.[3]).toEqual(expect.objectContaining({ role: 'user' }))
  })

  it('truncates history to most recent entries and preserves ordering', async () => {
    genObjMock.mockResolvedValueOnce(makeObjectResult({ mode: 'answer', answerText: 'ok' }))

    const history = Array.from({ length: 30 }, (_, index) =>
      makeHistoryItem(index % 2 === 0 ? 'user' : 'assistant', `turn-${index}`)
    )

    const res = await POST(
      new Request('http://localhost/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({
          ...baseRequestBody,
          history,
        }),
      })
    )

    expect(res.status).toBe(200)

    const callArgs = genObjMock.mock.calls[0]?.[0] as
      | { messages?: Array<{ role: string; content: string }> }
      | undefined

    const messages = callArgs?.messages ?? []
    const historyMessages = messages.slice(1, -1)
    expect(historyMessages).toHaveLength(24)
    expect(historyMessages[0]?.content).toBe('turn-6')
    expect(historyMessages[23]?.content).toBe('turn-29')
  })

  it('truncates each history content entry to 5000 chars', async () => {
    genObjMock.mockResolvedValueOnce(makeObjectResult({ mode: 'answer', answerText: 'ok' }))

    const longContent = 'x'.repeat(5100)
    const res = await POST(
      new Request('http://localhost/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({
          ...baseRequestBody,
          history: [makeHistoryItem('assistant', longContent)],
        }),
      })
    )

    expect(res.status).toBe(200)

    const callArgs = genObjMock.mock.calls[0]?.[0] as
      | { messages?: Array<{ role: string; content: string }> }
      | undefined

    expect(callArgs?.messages?.[1]?.content).toHaveLength(5000)
  })

  it('supports gemini provider', async () => {
    genObjMock.mockResolvedValueOnce(
      makeObjectResult({ mode: 'answer', answerText: 'Looks plausible.' })
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
  })

  // --- Error propagation ----------------------------------------------------

  it('propagates upstream non-2xx JSON error payload', async () => {
    genObjMock.mockRejectedValueOnce(makeApiCallError(401, { error: 'Invalid key' }))

    const res = await POST(
      new Request('http://localhost/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify(baseRequestBody),
      })
    )

    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid key' })
  })

  // --- Response-body validation ---------------------------------------------

  it('returns 422 when model output is not valid JSON', async () => {
    genObjMock.mockRejectedValueOnce(makeApiCallError(422, { error: 'AI response is not valid JSON' }))

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
    genObjMock.mockRejectedValueOnce(makeApiCallError(422, { error: 'Invalid chat response', issues: [{ code: 'invalid_type' }] }))
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
