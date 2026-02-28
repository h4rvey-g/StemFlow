import { afterEach, describe, expect, it, vi } from 'vitest'

import { generateNextSteps } from '@/lib/ai-service'
import type { OMVNode, PlannerDirectionPreview } from '@/types/nodes'

vi.mock('ai', async () => {
  const actual = await vi.importActual('ai')
  return {
    ...actual,
    generateText: vi.fn(),
    streamText: vi.fn(),
  }
})

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => (model: string) => ({})),
}))

vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: vi.fn(() => (model: string) => ({})),
}))

vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: vi.fn(() => (model: string) => ({})),
}))

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

describe('ai service', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('uses planner-generated queries and performs one Exa search per direction', async () => {
    const exaQueries: string[] = []
    let directionCall = 0

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {}

      if (url.includes('/api/search/exa')) {
        const query = typeof body.query === 'string' ? body.query : ''
        exaQueries.push(query)
        return jsonResponse({
          text: `Title: Source ${exaQueries.length}\nURL: https://example.com/${exaQueries.length}\nSummary: grounded snippet ${exaQueries.length}`,
        })
      }

      return jsonResponse({ error: 'Not found' }, 404)
    })

    const { generateText } = await import('ai')
    let callCount = 0
    vi.mocked(generateText).mockImplementation(async () => {
      callCount++
      if (callCount === 1) {
        return {
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
          finishReason: 'stop',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        } as any
      }
      return {
        text: JSON.stringify([
          {
            type: 'OBSERVATION',
            summary_title: `Candidate ${callCount}`,
            text_content: `Direction ${callCount} grounded statement [[exa:1]]`,
            exa_citations: ['exa:1'],
          },
        ]),
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      } as any
    })

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
  })

  it('throws when planner returns fewer than 3 directions', async () => {
    const { generateText } = await import('ai')
    vi.mocked(generateText).mockResolvedValueOnce({
      text: JSON.stringify([
        {
          summary_title: 'Only one',
          direction_focus: 'Insufficient',
          search_query: 'only query',
        },
      ]),
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    } as any)

    await expect(
      generateNextSteps([createNode('1', 'OBSERVATION', 'Initial finding')], 'Goal', 'openai', 'sk-test')
    ).rejects.toThrow('AI returned fewer than 3 suggestions')
  })

  it('throws parse error when a direction returns no suggestion', async () => {
    let generationCallCount = 0
    const { generateText } = await import('ai')
    vi.mocked(generateText).mockImplementation(async () => {
      generationCallCount++
      if (generationCallCount === 1) {
        return {
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
          finishReason: 'stop',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        } as any
      }
      if (generationCallCount === 3) {
        return {
          text: JSON.stringify([]),
          finishReason: 'stop',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        } as any
      }
      return {
        text: JSON.stringify([
          {
            type: 'OBSERVATION',
            text_content: 'Valid direction [[exa:1]]',
            exa_citations: ['exa:1'],
          },
        ]),
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      } as any
    })

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        text: 'Title: Source\nURL: https://example.com/source\nSummary: snippet',
      })
    )

    await expect(
      generateNextSteps([createNode('1', 'OBSERVATION', 'Initial finding')], 'Goal', 'openai', 'sk-test')
    ).rejects.toThrow('Failed to parse AI response')
  })

  it('retries transient planner failures up to 3 attempts', async () => {
    let plannerAttempts = 0
    const { generateText } = await import('ai')
    vi.mocked(generateText).mockImplementation(async () => {
      plannerAttempts++
      if (plannerAttempts === 1) {
        return {
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
          finishReason: 'stop',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        } as any
      }
      return {
        text: JSON.stringify([
          {
            type: 'OBSERVATION',
            summary_title: `Candidate ${plannerAttempts}`,
            text_content: `Direction ${plannerAttempts} grounded statement [[exa:1]]`,
            exa_citations: ['exa:1'],
          },
        ]),
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      } as any
    })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        text: 'Title: Source\nURL: https://example.com/source\nSummary: snippet',
      })
    )
    const result = await generateNextSteps(
      [createNode('1', 'OBSERVATION', 'Initial finding')],
      'Goal',
      'openai',
      'sk-test'
    )
    expect(result).toHaveLength(3)
  })

  it('fails after 3 transient planner failures', async () => {
    let plannerAttempts = 0
    const { generateText } = await import('ai')
    vi.mocked(generateText).mockImplementation(async () => {
      plannerAttempts++
      throw new Error('Temporary planner failure')
    })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        text: 'Title: Source\nURL: https://example.com/source\nSummary: snippet',
      })
    )
    await expect(
      generateNextSteps([createNode('1', 'OBSERVATION', 'Initial finding')], 'Goal', 'openai', 'sk-test')
    ).rejects.toThrow('Temporary planner failure')
  })
})

describe('planNextDirections (planner-only preview)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns exactly 3 planner direction previews without Exa', async () => {
    const { generateText } = await import('ai')
    vi.mocked(generateText).mockResolvedValueOnce({
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
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    } as any)

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
  })

  it('throws when planner returns malformed JSON', async () => {
    const { generateText } = await import('ai')
    vi.mocked(generateText).mockResolvedValueOnce({
      text: 'This is not valid JSON at all',
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    } as any)

    const { planNextDirections } = await import('@/lib/ai-service')

    await expect(
      planNextDirections([createNode('1', 'OBSERVATION', 'Initial finding')], 'Goal', 'openai', 'sk-test')
    ).rejects.toThrow()
  })

  it('throws when planner returns fewer than 3 directions', async () => {
    const { generateText } = await import('ai')
    vi.mocked(generateText).mockResolvedValueOnce({
      text: JSON.stringify([
        {
          summary_title: 'Only one',
          direction_focus: 'Insufficient',
          search_query: 'only query',
        },
      ]),
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    } as any)
    const { planNextDirections } = await import('@/lib/ai-service')
    const result = await planNextDirections([createNode('1', 'OBSERVATION', 'Initial finding')], 'Goal', 'openai', 'sk-test')
    expect(result).toHaveLength(1)
  })

  it('does not call Exa search API', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.includes('/api/search/exa')) {
        throw new Error('Exa should not be called in planner-only mode')
      }

      return jsonResponse({ error: 'Not found' }, 404)
    })

    const { generateText } = await import('ai')
    vi.mocked(generateText).mockResolvedValueOnce({
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
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    } as any)

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
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        text: 'Title: Exa Source One\nURL: https://example.com/1\nSummary: Relevant snippet one\nPublished: 2024-01-01',
      })
    )

    const { streamText } = await import('ai')
    const mockStream = async function* () {
      yield JSON.stringify([
        {
          type: 'MECHANISM',
          summary_title: 'Accepted Direction',
          text_content: 'Full mechanism content grounded in Exa [[exa:1]]',
          exa_citations: ['exa:1'],
        },
      ])
    }
    vi.mocked(streamText).mockReturnValueOnce({
      textStream: mockStream(),
    } as any)

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
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ results: [] }))

    const { streamText } = await import('ai')
    const mockStream = async function* () {
      yield JSON.stringify([
        {
          type: 'MECHANISM',
          summary_title: 'Accepted Direction',
          text_content: 'Full mechanism content without citations',
        },
      ])
    }
    vi.mocked(streamText).mockReturnValueOnce({
      textStream: mockStream(),
    } as any)

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

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {}

      if (url.includes('/api/search/exa')) {
        const query = typeof body.query === 'string' ? body.query : ''
        exaQueries.push(query)
        return jsonResponse({ results: [] })
      }

      return jsonResponse({ error: 'Not found' }, 404)
    })

    const { streamText } = await import('ai')
    const mockStream = async function* () {
      yield JSON.stringify([
        {
          type: 'MECHANISM',
          summary_title: 'Accepted Direction',
          text_content: 'Content',
        },
      ])
    }
    vi.mocked(streamText).mockReturnValueOnce({
      textStream: mockStream(),
    } as any)

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

    const { streamText } = await import('ai')
    const mockStream = async function* () {
      yield JSON.stringify([
        {
          type: 'MECHANISM',
          summary_title: 'Accepted Direction',
          text_content: 'Content',
        },
      ])
    }
    vi.mocked(streamText).mockReturnValue({
      textStream: mockStream(),
    } as any)
    aiCallCount = 0
    vi.mocked(streamText).mockImplementation(() => {
      aiCallCount++
      const mockStream2 = async function* () {
        yield JSON.stringify([
          {
            type: 'MECHANISM',
            summary_title: 'Accepted Direction',
            text_content: 'Content',
          },
        ])
      }
      return {
        textStream: mockStream2(),
      } as any
    })
    vi.mocked(streamText).mockImplementation(() => {
      aiCallCount++
      const mockStream = async function* () {
        yield JSON.stringify([
          {
            type: 'MECHANISM',
            summary_title: 'Accepted Direction',
            text_content: 'Content',
          },
        ])
      }
      return {
        textStream: mockStream(),
      } as any
    })
    vi.mocked(streamText).mockImplementation(() => {
      aiCallCount++
      const mockStream = async function* () {
        yield JSON.stringify([
          {
            type: 'MECHANISM',
            summary_title: 'Accepted Direction',
            text_content: 'Content',
          },
        ])
      }
      return {
        textStream: mockStream(),
      } as any
    })

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ results: [] }))

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
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ results: [] }))

    const { streamText } = await import('ai')
    const error = new Error('Unauthorized')
    ;(error as any).status = 401
    vi.mocked(streamText).mockRejectedValueOnce(error)

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
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ results: [] }))

    const { streamText } = await import('ai')
    const error = new Error('Too Many Requests')
    ;(error as any).status = 429
    vi.mocked(streamText).mockRejectedValueOnce(error)

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
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ results: [] }))

    const { streamText } = await import('ai')
    const mockStream = async function* () {
      yield JSON.stringify([])
    }
    vi.mocked(streamText).mockReturnValueOnce({
      textStream: mockStream(),
    } as any)

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
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ results: [] }))

    const { streamText } = await import('ai')
    const mockStream = async function* () {
      yield JSON.stringify([
        {
          type: 'MECHANISM',
          text_content: 'Content without summary title',
        },
      ])
    }
    vi.mocked(streamText).mockReturnValueOnce({
      textStream: mockStream(),
    } as any)

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
})
