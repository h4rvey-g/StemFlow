import { generateText } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'

import { loadApiKeys } from '@/lib/api-keys'
import { formatAncestryForPrompt } from '@/lib/graph'
import type { AiMessage, AiProvider } from '@/lib/ai/types'
import type { NodeType, OMVNode } from '@/types/nodes'
import modelsSchema from '@/lib/models-schema.json'

export interface GeneratedStep {
  type: NodeType
  text_content: string
}

const DEFAULT_GEMINI_MODEL = 'gemini-2.5-pro'

const VISION_SYSTEM_PROMPT =
  'You are a scientific research assistant. Describe uploaded images clearly and concisely for experiment documentation. Focus on observable structures, labels, axes, and notable patterns. Avoid speculation.'

const inferProvider = (state: Awaited<ReturnType<typeof loadApiKeys>>): AiProvider | null => {
  if (state.provider) return state.provider
  if (state.openaiKey) return 'openai'
  if (state.geminiKey) return 'gemini'
  if (state.anthropicKey) return 'anthropic'
  return null
}

const getProviderSettings = async () => {
  const state = await loadApiKeys()
  const provider = inferProvider(state)
  if (!provider) {
    throw new Error('Configure an AI provider API key to enable image descriptions.')
  }

  if ((provider === 'openai' || provider === 'openai-compatible') && state.openaiKey) {
    return {
      provider,
      apiKey: state.openaiKey,
      model: state.openaiModel || DEFAULT_OPENAI_MODEL,
      baseUrl: state.openaiBaseUrl,
    }
  }

  if (provider === 'gemini' && state.geminiKey) {
    return {
      provider,
      apiKey: state.geminiKey,
      model: state.geminiModel || DEFAULT_GEMINI_MODEL,
      baseUrl: null,
    }
  }

  if (provider === 'anthropic' && state.anthropicKey) {
    return {
      provider,
      apiKey: state.anthropicKey,
      model: state.anthropicModel || DEFAULT_ANTHROPIC_MODEL,
      baseUrl: state.anthropicBaseUrl,
    }
  }

  throw new Error(`No API key configured for provider: ${provider}`)
}

const readErrorMessage = async (response: Response): Promise<string> => {
  const contentType = response.headers.get('content-type') || ''

  if (contentType.includes('application/json')) {
    const json = await response.json().catch(() => null)
    if (json && typeof json === 'object' && 'error' in json && typeof json.error === 'string') {
      return json.error
    }
  }

  const text = await response.text().catch(() => '')
  return text || `Vision request failed with status ${response.status}`
}

export const describeImageWithVision = async (
  imageDataUrl: string,
  contextText?: string
): Promise<string> => {
  const settings = await getProviderSettings()

  const messageText = contextText?.trim()
    ? `Provide a concise description of this image for the following node context: ${contextText.trim()}`
    : 'Provide a concise description of this image for a scientific research node.'

  const messages: AiMessage[] = [
    {
      role: 'system',
      content: VISION_SYSTEM_PROMPT,
    },
    {
      role: 'user',
      content: [
        { type: 'text', text: messageText },
        { type: 'image', dataUrl: imageDataUrl },
      ],
    },
  ]

  const response = await fetch(`/api/ai/${settings.provider}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apiKey: settings.apiKey,
      model: settings.model,
      baseUrl: settings.baseUrl,
      messages,
      stream: false,
      temperature: 0.2,
      maxTokens: 300,
    }),
  })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response))
  }

  const json = (await response.json()) as { text?: string }
  const description = typeof json.text === 'string' ? json.text.trim() : ''

  if (!description) {
    throw new Error('Vision model returned an empty description.')
  }

  return description
}

const DEFAULT_OPENAI_MODEL = 'gpt-4o'
const DEFAULT_ANTHROPIC_MODEL = 'claude-3-5-sonnet-20241022'

const getMaxOutputTokens = (modelId: string): number => {
  for (const provider of Object.values(modelsSchema)) {
    if (provider && typeof provider === 'object' && 'models' in provider) {
      const models = provider.models as Record<string, any>
      if (modelId in models) {
        return models[modelId]?.limit?.output ?? 4096
      }
    }
  }
  return 4096
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isNodeType = (value: unknown): value is NodeType =>
  value === 'OBSERVATION' || value === 'MECHANISM' || value === 'VALIDATION'

const getExpectedNextType = (currentType: NodeType): NodeType | null => {
  if (currentType === 'OBSERVATION') return 'MECHANISM'
  if (currentType === 'MECHANISM') return 'VALIDATION'
  if (currentType === 'VALIDATION') return 'OBSERVATION'
  return null
}

const extractJsonPayload = (content: string): string => {
  // Try to extract JSON from markdown code blocks
  const fenced =
    content.match(/```json\s*([\s\S]*?)```/i) ??
    content.match(/```\s*([\s\S]*?)```/i)
  
  if (fenced) {
    return fenced[1].trim()
  }
  
  // Try to find JSON array in the content
  const arrayMatch = content.match(/\[[\s\S]*\]/)
  if (arrayMatch) {
    return arrayMatch[0].trim()
  }
  
  // Return trimmed content as-is
  return content.trim()
}

const toGeneratedSteps = (payload: unknown): GeneratedStep[] => {
  const list = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.steps)
      ? payload.steps
      : null

  if (!list || list.length === 0) {
    console.error('[AI Service] Invalid payload structure:', {
      isArray: Array.isArray(payload),
      isRecord: isRecord(payload),
      hasSteps: isRecord(payload) && 'steps' in payload,
      payload
    })
    throw new Error('Failed to parse AI response')
  }

  return list.map((item, index) => {
    if (!isRecord(item)) {
      console.error(`[AI Service] Item ${index} is not a record:`, typeof item, item)
      throw new Error('Failed to parse AI response')
    }

    if (!('text_content' in item)) {
      if ('text_' in item) {
        (item as any).text_content = (item as any).text_
      } else if ('text' in item) {
        (item as any).text_content = (item as any).text
      }
    }

    const { type, text_content } = item
    if (!isNodeType(type) || typeof text_content !== 'string') {
      console.error(`[AI Service] Item ${index} has invalid fields:`, {
        type,
        isValidType: isNodeType(type),
        text_content,
        isValidContent: typeof text_content === 'string'
      })
      throw new Error('Failed to parse AI response')
    }

    return { type, text_content }
  })
}

const buildPrompt = (
  ancestry: OMVNode[],
  globalGoal: string,
  expectedNextType: NodeType | null
): string => {
  const ancestryContext = formatAncestryForPrompt(ancestry)
  const goal = globalGoal.trim() || 'No global goal provided.'
  const context = ancestryContext.trim() || 'No ancestry context provided.'

  return [
    'You are assisting with scientific research using the Observation-Mechanism-Validation (OMV) framework.',
    `Global research goal:\n${goal}`,
    `Ancestry context:\n${context}`,
    'Suggest 1 to 3 next steps in the OMV framework.',
    expectedNextType
      ? `STRICT SEQUENCE RULE: The current node is ${ancestry[ancestry.length - 1]?.type}. Every suggested step MUST have type "${expectedNextType}".`
      : 'Follow the OMV sequence based on the current context.',
    '',
    'CRITICAL: You must respond with ONLY a valid JSON array. No explanations, no markdown, no additional text.',
    'Format: [{"type": "OBSERVATION", "text_content": "description"}, ...]',
    'The "type" must be exactly one of: "OBSERVATION", "MECHANISM", or "VALIDATION".',
    '',
    'Example response:',
    '[{"type": "OBSERVATION", "text_content": "Collect baseline metrics"}, {"type": "MECHANISM", "text_content": "Analyze correlation patterns"}]'
  ].join('\n')
}

export async function generateNextSteps(
  ancestry: OMVNode[],
  globalGoal: string,
  provider: 'openai' | 'anthropic' | 'openai-compatible',
  apiKey: string,
  model?: string | null,
  baseUrl?: string | null
): Promise<GeneratedStep[]> {
  const currentNode = ancestry[ancestry.length - 1]
  const expectedNextType = currentNode ? getExpectedNextType(currentNode.type) : null
  const prompt = buildPrompt(ancestry, globalGoal, expectedNextType)

  try {
    let content: string

    if (provider === 'openai' || provider === 'openai-compatible') {
      const openai = createOpenAI({
        apiKey,
        baseURL: baseUrl || undefined
      })

      const modelName = model || DEFAULT_OPENAI_MODEL
      const result = await generateText({
        model: openai.chat(modelName),
        prompt,
        temperature: 0.4,
        maxOutputTokens: getMaxOutputTokens(modelName)
      })

      if (result.finishReason === 'length') {
        throw new Error('Response was truncated due to length limit. Try a shorter prompt or simpler request.')
      }

      content = result.text
    } else {
      const anthropic = createAnthropic({
        apiKey,
        baseURL: baseUrl || undefined
      })

      const modelName = model || DEFAULT_ANTHROPIC_MODEL
      const result = await generateText({
        model: anthropic(modelName),
        prompt,
        temperature: 0.4,
        maxOutputTokens: getMaxOutputTokens(modelName)
      })

      if (result.finishReason === 'length') {
        throw new Error('Response was truncated due to length limit. Try a shorter prompt or simpler request.')
      }

      content = result.text
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(extractJsonPayload(content))
    } catch (error) {
      console.error('AI Response parsing failed. Raw content:', content)
      console.error('Extracted payload:', extractJsonPayload(content))
      throw new Error('Failed to parse AI response')
    }

    const steps = toGeneratedSteps(parsed)

    if (steps.length < 3) {
      throw new Error('AI returned fewer than 3 suggestions')
    }

    const normalizedSteps = expectedNextType
      ? steps.map((step) => ({ ...step, type: expectedNextType }))
      : steps

    return normalizedSteps.slice(0, 3)
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('401') || error.message.includes('403') || error.message.includes('API key')) {
        throw new Error('Invalid API key')
      }
      if (error.message.includes('429') || error.message.includes('rate limit')) {
        throw new Error('Rate limit exceeded')
      }
      if (error.message.includes('Failed to parse')) {
        throw error
      }
      if (error.message.includes('fetch') || error.message.includes('network')) {
        throw new Error('Network error: Failed to reach AI provider')
      }
      throw error
    }
    throw new Error('AI request failed')
  }
}
