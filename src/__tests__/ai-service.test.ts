import { afterEach, describe, expect, it, vi } from 'vitest'

import { generateNextSteps } from '@/lib/ai-service'
import type { OMVNode } from '@/types/nodes'

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
