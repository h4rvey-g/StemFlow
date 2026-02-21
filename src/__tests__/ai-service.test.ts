import { afterEach, describe, expect, it, vi } from 'vitest'

import { generateNextSteps } from '@/lib/ai-service'
import type { OMVNode, PlannerDirectionPreview } from '@/types/nodes'

const createNode = (id: string, type: OMVNode['type'], text: string): OMVNode =>
  ({
    id,
    type,
    data: { text_content: text },
    position: { x: 0, y: 0 },
  } as OMVNode)

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

const sseResponse = (events: string[]): Response => {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(event))
      }
      controller.close()
    },
  })

  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

describe('ai service', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('uses planner-generated queries and performs one Exa search per direction', async () => {
    const exaQueries: string[] = []
    let directionCall = 0

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {}

      if (url.includes('/api/search/exa')) {
        const query = typeof body.query === 'string' ? body.query : ''
        exaQueries.push(query)
        return jsonResponse({
          text: `Title: Source ${exaQueries.length}\nURL: https://example.com/${exaQueries.length}\nSummary: grounded snippet ${exaQueries.length}`,
        })
      }

      if (url.includes('/api/ai/openai')) {
        const messages = Array.isArray(body.messages)
          ? (body.messages as Array<{ role?: string; content?: string }>)
          : []
        const systemMessage = messages.find((message) => message.role === 'system')?.content ?? ''

        if (typeof systemMessage === 'string' && systemMessage.includes('scientific research planner')) {
          return jsonResponse({
            text: JSON.stringify([
              {
                summary_title: 'Direction One',
                direction_focus: 'Focus one',
                search_query: 'query one',
              },
              {
                summary_title: 'Direction Two',
                direction_focus: 'Focus two',
                search_query: 'query two',
              },
              {
                summary_title: 'Direction Three',
                direction_focus: 'Focus three',
                search_query: 'query three',
              },
            ]),
          })
        }

        directionCall += 1
        return jsonResponse({
          text: JSON.stringify([
            {
              type: 'OBSERVATION',
              summary_title: `Candidate ${directionCall}`,
              text_content: `Direction ${directionCall} grounded statement [[exa:1]]`,
              exa_citations: ['exa:1'],
            },
          ]),
        })
      }

      return jsonResponse({ error: 'Not found' }, 404)
    })

    vi.stubGlobal('fetch', fetchMock as typeof fetch)

    const result = await generateNextSteps(
      [createNode('1', 'OBSERVATION', 'Initial finding')],
      'Improve model accuracy',
      'openai',
      'sk-test'
    )

    expect(exaQueries).toEqual(['query one', 'query two', 'query three'])
    expect(result).toHaveLength(3)
    expect(result.every((step) => step.type === 'MECHANISM')).toBe(true)
    expect(result.every((step) => (step.citations?.length ?? 0) === 1)).toBe(true)
    expect(fetchMock).toHaveBeenCalled()
  })

  it('throws when planner returns fewer than 3 directions', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.includes('/api/ai/openai')) {
        return jsonResponse({
          text: JSON.stringify([
            {
              summary_title: 'Only one',
              direction_focus: 'Insufficient',
              search_query: 'only query',
            },
          ]),
        })
      }

      return jsonResponse({ text: '' })
    })

    vi.stubGlobal('fetch', fetchMock as typeof fetch)

    await expect(
      generateNextSteps([createNode('1', 'OBSERVATION', 'Initial finding')], 'Goal', 'openai', 'sk-test')
    ).rejects.toThrow('AI returned fewer than 3 planned directions')
  })

  it('throws parse error when a direction returns no suggestion', async () => {
    let generationCallCount = 0

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.includes('/api/search/exa')) {
        return jsonResponse({
          text: 'Title: Source\nURL: https://example.com/source\nSummary: snippet',
        })
      }

      if (url.includes('/api/ai/openai')) {
        generationCallCount += 1

        if (generationCallCount === 1) {
          return jsonResponse({
            text: JSON.stringify([
              {
                summary_title: 'Direction One',
                direction_focus: 'Focus one',
                search_query: 'query one',
              },
              {
                summary_title: 'Direction Two',
                direction_focus: 'Focus two',
                search_query: 'query two',
              },
              {
                summary_title: 'Direction Three',
                direction_focus: 'Focus three',
                search_query: 'query three',
              },
            ]),
          })
        }

        if (generationCallCount === 3) {
          return jsonResponse({ text: JSON.stringify([]) })
        }

        return jsonResponse({
          text: JSON.stringify([
            {
              type: 'OBSERVATION',
              text_content: 'Valid direction [[exa:1]]',
              exa_citations: ['exa:1'],
            },
          ]),
        })
      }

      return jsonResponse({ error: 'Not found' }, 404)
    })

    vi.stubGlobal('fetch', fetchMock as typeof fetch)

    await expect(
      generateNextSteps([createNode('1', 'OBSERVATION', 'Initial finding')], 'Goal', 'openai', 'sk-test')
    ).rejects.toThrow('Failed to parse AI response')
  })

  it('retries transient planner failures up to 3 attempts', async () => {
    let plannerAttempts = 0
    let directionCall = 0

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {}

      if (url.includes('/api/search/exa')) {
        return jsonResponse({
          text: 'Title: Source\nURL: https://example.com/source\nSummary: snippet',
        })
      }

      if (url.includes('/api/ai/openai')) {
        const messages = Array.isArray(body.messages)
          ? (body.messages as Array<{ role?: string; content?: string }>)
          : []
        const systemMessage = messages.find((message) => message.role === 'system')?.content ?? ''

        if (typeof systemMessage === 'string' && systemMessage.includes('scientific research planner')) {
          plannerAttempts += 1
          if (plannerAttempts < 3) {
            return jsonResponse({ error: 'Temporary planner failure' }, 503)
          }

          return jsonResponse({
            text: JSON.stringify([
              {
                summary_title: 'Direction One',
                direction_focus: 'Focus one',
                search_query: 'query one',
              },
              {
                summary_title: 'Direction Two',
                direction_focus: 'Focus two',
                search_query: 'query two',
              },
              {
                summary_title: 'Direction Three',
                direction_focus: 'Focus three',
                search_query: 'query three',
              },
            ]),
          })
        }

        directionCall += 1
        return jsonResponse({
          text: JSON.stringify([
            {
              type: 'OBSERVATION',
              summary_title: `Candidate ${directionCall}`,
              text_content: `Direction ${directionCall} grounded statement [[exa:1]]`,
              exa_citations: ['exa:1'],
            },
          ]),
        })
      }

      return jsonResponse({ error: 'Not found' }, 404)
    })

    vi.stubGlobal('fetch', fetchMock as typeof fetch)

    const result = await generateNextSteps(
      [createNode('1', 'OBSERVATION', 'Initial finding')],
      'Goal',
      'openai',
      'sk-test'
    )

    expect(result).toHaveLength(3)
    expect(plannerAttempts).toBe(3)
  })

  it('fails after 3 transient planner failures', async () => {
    let plannerAttempts = 0

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {}

      if (url.includes('/api/ai/openai')) {
        const messages = Array.isArray(body.messages)
          ? (body.messages as Array<{ role?: string; content?: string }>)
          : []
        const systemMessage = messages.find((message) => message.role === 'system')?.content ?? ''

        if (typeof systemMessage === 'string' && systemMessage.includes('scientific research planner')) {
          plannerAttempts += 1
          return jsonResponse({ error: 'Temporary planner failure' }, 503)
        }

        return jsonResponse({
          text: JSON.stringify([
            {
              type: 'OBSERVATION',
              text_content: 'Fallback direction [[exa:1]]',
              exa_citations: ['exa:1'],
            },
          ]),
        })
      }

      if (url.includes('/api/search/exa')) {
        return jsonResponse({
          text: 'Title: Source\nURL: https://example.com/source\nSummary: snippet',
        })
      }

      return jsonResponse({ error: 'Not found' }, 404)
    })

    vi.stubGlobal('fetch', fetchMock as typeof fetch)

    await expect(
      generateNextSteps([createNode('1', 'OBSERVATION', 'Initial finding')], 'Goal', 'openai', 'sk-test')
    ).rejects.toThrow('Temporary planner failure')
    expect(plannerAttempts).toBe(3)
  })
})

describe('planNextDirections (planner-only preview)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns exactly 3 planner direction previews without Exa', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.includes('/api/ai/openai')) {
        return jsonResponse({
          text: JSON.stringify([
            {
              summary_title: 'Direction One',
              direction_focus: 'Focus one',
              search_query: 'query one',
            },
            {
              summary_title: 'Direction Two',
              direction_focus: 'Focus two',
              search_query: 'query two',
            },
            {
              summary_title: 'Direction Three',
              direction_focus: 'Focus three',
              search_query: 'query three',
            },
          ]),
        })
      }

      return jsonResponse({ error: 'Not found' }, 404)
    })

    vi.stubGlobal('fetch', fetchMock as typeof fetch)

    const { planNextDirections } = await import('@/lib/ai-service')
    const result = await planNextDirections(
      [createNode('1', 'OBSERVATION', 'Initial finding')],
      'Improve model accuracy',
      'openai',
      'sk-test'
    )

    expect(result).toHaveLength(3)
    expect(result[0]).toMatchObject({
      summary_title: 'Direction One',
      suggestedType: 'MECHANISM',
      searchQuery: 'query one',
    })
    expect(result[0].id).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/ai/openai')
  })

  it('throws when planner returns malformed JSON', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.includes('/api/ai/openai')) {
        return jsonResponse({
          text: 'This is not valid JSON at all',
        })
      }

      return jsonResponse({ error: 'Not found' }, 404)
    })

    vi.stubGlobal('fetch', fetchMock as typeof fetch)

    const { planNextDirections } = await import('@/lib/ai-service')

    await expect(
      planNextDirections([createNode('1', 'OBSERVATION', 'Initial finding')], 'Goal', 'openai', 'sk-test')
    ).rejects.toThrow()
  })

  it('throws when planner returns fewer than 3 directions', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.includes('/api/ai/openai')) {
        return jsonResponse({
          text: JSON.stringify([
            {
              summary_title: 'Only one',
              direction_focus: 'Insufficient',
              search_query: 'only query',
            },
          ]),
        })
      }

      return jsonResponse({ text: '' })
    })

    vi.stubGlobal('fetch', fetchMock as typeof fetch)

    const { planNextDirections } = await import('@/lib/ai-service')

    await expect(
      planNextDirections([createNode('1', 'OBSERVATION', 'Initial finding')], 'Goal', 'openai', 'sk-test')
    ).rejects.toThrow('AI returned fewer than 3 planned directions')
  })

  it('does not call Exa search API', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.includes('/api/search/exa')) {
        throw new Error('Exa should not be called in planner-only mode')
      }

      if (url.includes('/api/ai/openai')) {
        return jsonResponse({
          text: JSON.stringify([
            {
              summary_title: 'Direction One',
              direction_focus: 'Focus one',
              search_query: 'query one',
            },
            {
              summary_title: 'Direction Two',
              direction_focus: 'Focus two',
              search_query: 'query two',
            },
            {
              summary_title: 'Direction Three',
              direction_focus: 'Focus three',
              search_query: 'query three',
            },
          ]),
        })
      }

      return jsonResponse({ error: 'Not found' }, 404)
    })

    vi.stubGlobal('fetch', fetchMock as typeof fetch)

    const { planNextDirections } = await import('@/lib/ai-service')
    await planNextDirections([createNode('1', 'OBSERVATION', 'Initial finding')], 'Goal', 'openai', 'sk-test')

    const exaCalls = fetchMock.mock.calls.filter((call) => String(call[0]).includes('/api/search/exa'))
    expect(exaCalls).toHaveLength(0)
  })
})

describe('generateStepFromDirection (accept-time full generation)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  const makeDirection = (overrides?: Partial<PlannerDirectionPreview>): PlannerDirectionPreview => ({
    id: 'planner-test-abc',
    summary_title: 'Accepted Direction',
    suggestedType: 'MECHANISM',
    searchQuery: 'accepted direction search query',
    sourceNodeId: '1',
    ...overrides,
  })

  it('returns a hydrated GeneratedStep with citations when Exa returns sources', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {}

      if (url.includes('/api/search/exa')) {
        return jsonResponse({
          text: 'Title: Exa Source One\nURL: https://example.com/1\nSummary: Relevant snippet one\nPublished: 2024-01-01',
        })
      }

      if (url.includes('/api/ai/openai')) {
        const messages = Array.isArray(body.messages)
          ? (body.messages as Array<{ role?: string; content?: string }>)
          : []
        const userMessage = messages.find((m) => m.role === 'user')?.content ?? ''

        expect(typeof userMessage === 'string' && userMessage.includes('Direction Constraint')).toBe(true)

        return jsonResponse({
          text: JSON.stringify([
            {
              type: 'MECHANISM',
              summary_title: 'Accepted Direction',
              text_content: 'Full mechanism content grounded in Exa [[exa:1]]',
              exa_citations: ['exa:1'],
            },
          ]),
        })
      }

      return jsonResponse({ error: 'Not found' }, 404)
    })

    vi.stubGlobal('fetch', fetchMock as typeof fetch)

    const { generateStepFromDirection } = await import('@/lib/ai-service')
    const result = await generateStepFromDirection(
      makeDirection(),
      [createNode('1', 'OBSERVATION', 'Initial finding')],
      'Improve model accuracy',
      'openai',
      'sk-test'
    )

    expect(result.type).toBe('MECHANISM')
    expect(result.text_content).toContain('Full mechanism content')
    expect(result.summary_title).toBeTruthy()
    expect(result.citations).toHaveLength(1)
    expect(result.citations![0].title).toBe('Exa Source One')
    expect(result.citations![0].url).toBe('https://example.com/1')
  })

  it('returns a step without citations when Exa returns no results', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.includes('/api/search/exa')) {
        return jsonResponse({ results: [] })
      }

      if (url.includes('/api/ai/openai')) {
        return jsonResponse({
          text: JSON.stringify([
            {
              type: 'MECHANISM',
              summary_title: 'Accepted Direction',
              text_content: 'Full mechanism content without citations',
            },
          ]),
        })
      }

      return jsonResponse({ error: 'Not found' }, 404)
    })

    vi.stubGlobal('fetch', fetchMock as typeof fetch)

    const { generateStepFromDirection } = await import('@/lib/ai-service')
    const result = await generateStepFromDirection(
      makeDirection(),
      [createNode('1', 'OBSERVATION', 'Initial finding')],
      'Goal',
      'openai',
      'sk-test'
    )

    expect(result.type).toBe('MECHANISM')
    expect(result.text_content).toBeTruthy()
    expect(result.citations ?? []).toHaveLength(0)
  })

  it('uses the direction searchQuery for Exa (not ancestry-derived query)', async () => {
    const exaQueries: string[] = []

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {}

      if (url.includes('/api/search/exa')) {
        const query = typeof body.query === 'string' ? body.query : ''
        exaQueries.push(query)
        return jsonResponse({ results: [] })
      }

      if (url.includes('/api/ai/openai')) {
        return jsonResponse({
          text: JSON.stringify([
            {
              type: 'MECHANISM',
              summary_title: 'Accepted Direction',
              text_content: 'Content',
            },
          ]),
        })
      }

      return jsonResponse({ error: 'Not found' }, 404)
    })

    vi.stubGlobal('fetch', fetchMock as typeof fetch)

    const { generateStepFromDirection } = await import('@/lib/ai-service')
    await generateStepFromDirection(
      makeDirection({ searchQuery: 'specific direction query for exa' }),
      [createNode('1', 'OBSERVATION', 'Initial finding')],
      'Goal',
      'openai',
      'sk-test'
    )

    expect(exaQueries).toHaveLength(1)
    expect(exaQueries[0]).toBe('specific direction query for exa')
  })

  it('does NOT call the planner (only one AI call for generation)', async () => {
    let aiCallCount = 0

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.includes('/api/search/exa')) {
        return jsonResponse({ results: [] })
      }

      if (url.includes('/api/ai/openai')) {
        aiCallCount += 1
        return jsonResponse({
          text: JSON.stringify([
            {
              type: 'MECHANISM',
              summary_title: 'Accepted Direction',
              text_content: 'Content',
            },
          ]),
        })
      }

      return jsonResponse({ error: 'Not found' }, 404)
    })

    vi.stubGlobal('fetch', fetchMock as typeof fetch)

    const { generateStepFromDirection } = await import('@/lib/ai-service')
    await generateStepFromDirection(
      makeDirection(),
      [createNode('1', 'OBSERVATION', 'Initial finding')],
      'Goal',
      'openai',
      'sk-test'
    )

    expect(aiCallCount).toBe(1)
  })

  it('maps 401/403 errors to "Invalid API key"', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.includes('/api/search/exa')) {
        return jsonResponse({ results: [] })
      }

      if (url.includes('/api/ai/openai')) {
        return jsonResponse({ error: 'Unauthorized' }, 401)
      }

      return jsonResponse({ error: 'Not found' }, 404)
    })

    vi.stubGlobal('fetch', fetchMock as typeof fetch)

    const { generateStepFromDirection } = await import('@/lib/ai-service')
    await expect(
      generateStepFromDirection(
        makeDirection(),
        [createNode('1', 'OBSERVATION', 'Initial finding')],
        'Goal',
        'openai',
        'sk-test'
      )
    ).rejects.toThrow('Invalid API key')
  })

  it('maps 429 errors to "Rate limit exceeded"', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.includes('/api/search/exa')) {
        return jsonResponse({ results: [] })
      }

      if (url.includes('/api/ai/openai')) {
        return jsonResponse({ error: 'Too Many Requests' }, 429)
      }

      return jsonResponse({ error: 'Not found' }, 404)
    })

    vi.stubGlobal('fetch', fetchMock as typeof fetch)

    const { generateStepFromDirection } = await import('@/lib/ai-service')
    await expect(
      generateStepFromDirection(
        makeDirection(),
        [createNode('1', 'OBSERVATION', 'Initial finding')],
        'Goal',
        'openai',
        'sk-test'
      )
    ).rejects.toThrow('Rate limit exceeded')
  })

  it('throws parse error when AI returns empty array', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.includes('/api/search/exa')) {
        return jsonResponse({ results: [] })
      }

      if (url.includes('/api/ai/openai')) {
        return jsonResponse({ text: JSON.stringify([]) })
      }

      return jsonResponse({ error: 'Not found' }, 404)
    })

    vi.stubGlobal('fetch', fetchMock as typeof fetch)

    const { generateStepFromDirection } = await import('@/lib/ai-service')
    await expect(
      generateStepFromDirection(
        makeDirection(),
        [createNode('1', 'OBSERVATION', 'Initial finding')],
        'Goal',
        'openai',
        'sk-test'
      )
    ).rejects.toThrow('Failed to parse AI response')
  })

  it('falls back to direction summary_title when AI omits summary_title', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.includes('/api/search/exa')) {
        return jsonResponse({ results: [] })
      }

      if (url.includes('/api/ai/openai')) {
        return jsonResponse({
          text: JSON.stringify([
            {
              type: 'MECHANISM',
              text_content: 'Content without summary title',
            },
          ]),
        })
      }

      return jsonResponse({ error: 'Not found' }, 404)
    })

    vi.stubGlobal('fetch', fetchMock as typeof fetch)

    const { generateStepFromDirection } = await import('@/lib/ai-service')
    const result = await generateStepFromDirection(
      makeDirection({ summary_title: 'Fallback Title From Direction' }),
      [createNode('1', 'OBSERVATION', 'Initial finding')],
      'Goal',
      'openai',
      'sk-test'
    )

    expect(result.summary_title).toBe('Fallback Title From Direction')
  })

  it('falls back to non-stream JSON request when SSE stream yields no content', async () => {
    const aiPayloads: Array<Record<string, unknown>> = []

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {}

      if (url.includes('/api/search/exa')) {
        return jsonResponse({ results: [] })
      }

      if (url.includes('/api/ai/openai')) {
        aiPayloads.push(body)

        if (aiPayloads.length === 1) {
          return sseResponse(['data: {}\n\n'])
        }

        return jsonResponse({
          text: JSON.stringify([
            {
              type: 'MECHANISM',
              summary_title: 'Recovered Direction',
              text_content: 'Recovered from JSON fallback',
            },
          ]),
        })
      }

      return jsonResponse({ error: 'Not found' }, 404)
    })

    vi.stubGlobal('fetch', fetchMock as typeof fetch)

    const { generateStepFromDirection } = await import('@/lib/ai-service')
    const result = await generateStepFromDirection(
      makeDirection(),
      [createNode('1', 'OBSERVATION', 'Initial finding')],
      'Goal',
      'openai',
      'sk-test'
    )

    expect(result.text_content).toBe('Recovered from JSON fallback')
    expect(aiPayloads).toHaveLength(2)
    expect(aiPayloads[0]?.stream).toBe(true)
    expect(aiPayloads[1]?.stream).toBe(false)
  })

  it('parses SSE content even in non-stream fallback when provider ignores stream flag', async () => {
    const aiPayloads: Array<Record<string, unknown>> = []

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {}

      if (url.includes('/api/search/exa')) {
        return jsonResponse({ results: [] })
      }

      if (url.includes('/api/ai/openai-compatible')) {
        aiPayloads.push(body)

        if (aiPayloads.length === 1) {
          return sseResponse(['data: {}\n\n'])
        }

        return sseResponse([
          'data: {"choices":[{"delta":{"content":"[{\\"type\\":\\"MECHANISM\\",\\"summary_title\\":\\"Recovered Direction\\",\\"text_content\\":\\"Recovered from fallback SSE\\"}]"}}]}\n\n',
          'data: [DONE]\n\n',
        ])
      }

      return jsonResponse({ error: 'Not found' }, 404)
    })

    vi.stubGlobal('fetch', fetchMock as typeof fetch)

    const { generateStepFromDirection } = await import('@/lib/ai-service')
    const result = await generateStepFromDirection(
      makeDirection(),
      [createNode('1', 'OBSERVATION', 'Initial finding')],
      'Goal',
      'openai-compatible',
      'sk-test'
    )

    expect(result.text_content).toBe('Recovered from fallback SSE')
    expect(aiPayloads).toHaveLength(2)
    expect(aiPayloads[0]?.stream).toBe(true)
    expect(aiPayloads[1]?.stream).toBe(false)
  })
})
