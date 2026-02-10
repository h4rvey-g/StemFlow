import { afterEach, describe, expect, it, vi } from 'vitest'

import { generateNextSteps } from '@/lib/ai-service'
import type { OMVNode } from '@/types/nodes'

vi.mock('ai', () => ({
  generateText: vi.fn()
}))

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => ({
    chat: vi.fn()
  }))
}))

vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: vi.fn(() => vi.fn())
}))

const createNode = (id: string, type: OMVNode['type'], text: string): OMVNode =>
  ({
    id,
    type,
    data: { text_content: text },
    position: { x: 0, y: 0 }
  } as OMVNode)

describe('ai service', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns generated steps from openai response', async () => {
    const { generateText } = await import('ai')
    
    vi.mocked(generateText).mockResolvedValue({
      text: JSON.stringify([
        { type: 'OBSERVATION', text_content: 'Check dataset drift.' },
        { type: 'MECHANISM', text_content: 'Hypothesize a causal driver.' },
        { type: 'VALIDATION', text_content: 'Run a controlled experiment.' }
      ]),
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 }
    } as any)

    const result = await generateNextSteps(
      [createNode('1', 'OBSERVATION', 'Initial finding')],
      'Improve model accuracy',
      'openai',
      'sk-test'
    )

    const firstCall = vi.mocked(generateText).mock.calls[0]
    expect(firstCall).toBeTruthy()
    if (firstCall) {
      const options = firstCall[0] as { prompt?: string }
      expect(options.prompt).toContain('Use **bold** for the most important terms and *italic* for secondary emphasis.')
    }

    expect(result).toEqual([
      {
        type: 'MECHANISM',
        summary_title: 'Check dataset drift.',
        text_content: 'Check dataset drift.',
      },
      {
        type: 'MECHANISM',
        summary_title: 'Hypothesize a causal driver.',
        text_content: 'Hypothesize a causal driver.',
      },
      {
        type: 'MECHANISM',
        summary_title: 'Run a controlled experiment.',
        text_content: 'Run a controlled experiment.',
      }
    ])
    expect(generateText).toHaveBeenCalledTimes(1)
  })

  it('returns generated steps from anthropic response', async () => {
    const { generateText } = await import('ai')
    
    vi.mocked(generateText).mockResolvedValue({
      text: JSON.stringify([
        { type: 'MECHANISM', text_content: 'Hypothesize signal leakage.' },
        { type: 'VALIDATION', text_content: 'Test on a holdout split.' },
        { type: 'OBSERVATION', text_content: 'Collect a new sample.' }
      ]),
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 }
    } as any)

    const result = await generateNextSteps(
      [createNode('2', 'MECHANISM', 'Potential cause')],
      'Validate hypothesis',
      'anthropic',
      'sk-test'
    )

    expect(result).toEqual([
      {
        type: 'VALIDATION',
        summary_title: 'Hypothesize signal leakage.',
        text_content: 'Hypothesize signal leakage.',
      },
      {
        type: 'VALIDATION',
        summary_title: 'Test on a holdout split.',
        text_content: 'Test on a holdout split.',
      },
      {
        type: 'VALIDATION',
        summary_title: 'Collect a new sample.',
        text_content: 'Collect a new sample.',
      }
    ])
    expect(generateText).toHaveBeenCalledTimes(1)
  })

  it('throws for invalid api key responses', async () => {
    const { generateText } = await import('ai')
    
    vi.mocked(generateText).mockRejectedValue(new Error('401 Unauthorized - Invalid API key'))

    await expect(
      generateNextSteps([], 'Goal', 'openai', 'bad-key')
    ).rejects.toThrow('Invalid API key')
  })

  it('throws for rate limit responses', async () => {
    const { generateText } = await import('ai')
    
    vi.mocked(generateText).mockRejectedValue(new Error('429 Too Many Requests - rate limit exceeded'))

    await expect(
      generateNextSteps([], 'Goal', 'anthropic', 'sk-test')
    ).rejects.toThrow('Rate limit exceeded')
  })

  it('throws for invalid response payloads', async () => {
    const { generateText } = await import('ai')
    
    vi.mocked(generateText).mockResolvedValue({
      text: 'not-json',
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 }
    } as any)

    await expect(
      generateNextSteps([], 'Goal', 'openai', 'sk-test')
    ).rejects.toThrow('Failed to parse AI response')
  })

  it('throws on network failures', async () => {
    const { generateText } = await import('ai')
    
    vi.mocked(generateText).mockRejectedValue(new Error('fetch failed - network down'))

    await expect(
      generateNextSteps([], 'Goal', 'openai', 'sk-test')
    ).rejects.toThrow('Network error: Failed to reach AI provider')
  })

  it('returns generated steps from openai-compatible provider', async () => {
    const { generateText } = await import('ai')
    
    vi.mocked(generateText).mockResolvedValue({
      text: JSON.stringify([
        { type: 'VALIDATION', text_content: 'Run A/B test.' },
        { type: 'MECHANISM', text_content: 'Explain the effect size.' },
        { type: 'OBSERVATION', text_content: 'Collect baseline metrics.' }
      ]),
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 }
    } as any)

    const result = await generateNextSteps(
      [createNode('3', 'VALIDATION', 'Test results')],
      'Verify improvement',
      'openai-compatible',
      'sk-test',
      'custom-model',
      'https://custom-api.example.com/v1'
    )

    expect(result).toEqual([
      {
        type: 'OBSERVATION',
        summary_title: 'Run A/B test.',
        text_content: 'Run A/B test.',
      },
      {
        type: 'OBSERVATION',
        summary_title: 'Explain the effect size.',
        text_content: 'Explain the effect size.',
      },
      {
        type: 'OBSERVATION',
        summary_title: 'Collect baseline metrics.',
        text_content: 'Collect baseline metrics.',
      }
    ])
    expect(generateText).toHaveBeenCalledTimes(1)
  })

  it('throws when fewer than 3 steps are returned', async () => {
    const { generateText } = await import('ai')

    vi.mocked(generateText).mockResolvedValue({
      text: JSON.stringify([{ type: 'OBSERVATION', text_content: 'Only one.' }]),
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 }
    } as any)

    await expect(
      generateNextSteps(
        [createNode('1', 'OBSERVATION', 'Initial finding')],
        'Goal',
        'openai',
        'sk-test'
      )
    ).rejects.toThrow('AI returned fewer than 3 suggestions')
  })
})
