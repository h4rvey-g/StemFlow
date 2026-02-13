import { generateText } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'

import { loadApiKeys } from '@/lib/api-keys'
import { formatAncestryForPrompt } from '@/lib/graph'
import type { NodeSuggestionContext } from '@/lib/graph'
import type { AiMessage, AiProvider } from '@/lib/ai/types'
import type { NodeType, OMVNode } from '@/types/nodes'
import modelsSchema from '@/lib/models-schema.json'
import {
  interpolatePromptTemplate,
  loadPromptSettings,
  type PromptSettings,
} from '@/lib/prompt-settings'
import {
  useStore,
  formatExperimentalConditionsForPrompt,
} from '@/stores/useStore'

export interface GeneratedStep {
  type: NodeType
  text_content: string
  summary_title?: string
}

const clampGrade = (value: number): number => Math.min(5, Math.max(1, Math.round(value)))

const RATING_NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
}

const RATING_CJK_DIGITS: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
}

const RATING_LETTER_GRADES: Record<string, number> = {
  'A+': 5,
  A: 5,
  'A-': 5,
  'B+': 4,
  B: 4,
  'B-': 4,
  'C+': 3,
  C: 3,
  'C-': 3,
  'D+': 2,
  D: 2,
  'D-': 2,
  F: 1,
}

const RATING_KEYS = ['rating', 'score', 'stars', 'star', 'grade'] as const

const DEFAULT_GEMINI_MODEL = 'gemini-2.5-pro'

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

const parseNumericRatingFromText = (text: string): number | null => {
  const trimmed = text.trim()
  if (!trimmed) return null

  const direct = Number(trimmed)
  if (Number.isFinite(direct)) {
    return clampGrade(direct)
  }

  const fractional = trimmed.match(/(-?\d+(?:\.\d+)?)\s*\/\s*(5|10)\b/i)
  if (fractional) {
    const numerator = Number(fractional[1])
    const denominator = Number(fractional[2])
    if (Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0) {
      const normalized = denominator === 10 ? numerator / 2 : numerator
      return clampGrade(normalized)
    }
  }

  const labeledNumber = trimmed.match(/(?:rating|score|stars?|grade)\s*[:=-]?\s*(-?\d+(?:\.\d+)?)/i)
  if (labeledNumber) {
    const numeric = Number(labeledNumber[1])
    if (Number.isFinite(numeric)) {
      return clampGrade(numeric)
    }
  }

  const labeledLetter = trimmed.match(/(?:rating|score|stars?|grade)\s*[:=-]?\s*([ABCDF][+-]?)/i)
  if (labeledLetter) {
    const mapped = RATING_LETTER_GRADES[labeledLetter[1].toUpperCase()]
    if (typeof mapped === 'number') {
      return mapped
    }
  }

  const starred = trimmed.match(/[★⭐]/g)
  if (starred && starred.length >= 1) {
    return clampGrade(starred.length)
  }

  const cjkDigit = trimmed.match(/[一二三四五]/)
  if (cjkDigit) {
    const mapped = RATING_CJK_DIGITS[cjkDigit[0]]
    if (typeof mapped === 'number') {
      return mapped
    }
  }

  const lowered = trimmed.toLowerCase()
  for (const [word, value] of Object.entries(RATING_NUMBER_WORDS)) {
    if (new RegExp(`\\b${word}\\b`).test(lowered)) {
      return value
    }
  }

  const anyNumber = trimmed.match(/-?\d+(?:\.\d+)?/)
  if (anyNumber) {
    const numeric = Number(anyNumber[0])
    if (Number.isFinite(numeric)) {
      return clampGrade(numeric)
    }
  }

  return null
}

const extractGrade = (value: unknown, depth = 0): number | null => {
  if (depth > 3 || value == null) return null

  if (typeof value === 'number' && Number.isFinite(value)) {
    return clampGrade(value)
  }

  if (typeof value === 'string') {
    return parseNumericRatingFromText(value)
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const extracted = extractGrade(item, depth + 1)
      if (extracted !== null) return extracted
    }
    return null
  }

  if (isRecord(value)) {
    for (const key of RATING_KEYS) {
      const extracted = extractGrade(value[key], depth + 1)
      if (extracted !== null) return extracted
    }

    for (const nested of Object.values(value)) {
      const extracted = extractGrade(nested, depth + 1)
      if (extracted !== null) return extracted
    }
  }

  return null
}

const parseGrade = (content: string): number | null => {
  const trimmed = content.trim()
  if (!trimmed) {
    return null
  }

  const direct = parseNumericRatingFromText(trimmed)
  if (direct !== null) return direct

  const jsonCandidates = Array.from(new Set([trimmed, extractJsonPayload(trimmed)]))
  for (const candidate of jsonCandidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown
      const extracted = extractGrade(parsed)
      if (extracted !== null) {
        return extracted
      }
    } catch {
      // Ignore and continue fallback parsing.
    }
  }

  const fallback = extractGrade(trimmed)
  if (fallback !== null) return fallback

  return null
}

const recoverGrade = async (
  text: string,
  settings: Awaited<ReturnType<typeof getProviderSettings>>
): Promise<number | null> => {
  const promptSettings = loadPromptSettings()

  const response = await fetch(`/api/ai/${settings.provider}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apiKey: settings.apiKey,
      model: settings.model,
      baseUrl: settings.baseUrl,
      messages: [
        {
          role: 'system',
          content: promptSettings.ratingExtractionSystemPrompt,
        },
        {
          role: 'user',
          content: interpolatePromptTemplate(promptSettings.ratingExtractionUserPromptTemplate, {
            text,
          }),
        },
      ],
      stream: false,
      temperature: 0,
      maxTokens: 8,
    }),
  })

  if (!response.ok) {
    return null
  }

  const json = (await response.json()) as { text?: string }
  const candidate = typeof json.text === 'string' ? json.text : ''
  if (!candidate.trim()) {
    return null
  }

  const parsed = parseNumericRatingFromText(candidate)
  return parsed === null ? null : parsed
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
  const promptSettings = loadPromptSettings()

  const messageText = contextText?.trim()
    ? interpolatePromptTemplate(promptSettings.visionUserPromptWithContextTemplate, {
        context: contextText.trim(),
      })
    : promptSettings.visionUserPromptWithoutContext

  const messages: AiMessage[] = [
    {
      role: 'system',
      content: promptSettings.visionSystemPrompt,
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

export const gradeNode = async (
  node: Pick<NodeSuggestionContext, 'id' | 'type' | 'content'>,
  globalGoal: string
): Promise<number> => {
  const settings = await getProviderSettings()
  const promptSettings = loadPromptSettings()
  const goal = globalGoal.trim() || promptSettings.gradeGlobalGoalFallback

  const prompt = interpolatePromptTemplate(promptSettings.gradeUserPromptTemplate, {
    goal,
    nodeId: node.id,
    nodeType: node.type,
    nodeContent: node.content,
  })

  const messages: AiMessage[] = [
    {
      role: 'system',
      content: promptSettings.gradeSystemPrompt,
    },
    {
      role: 'user',
      content: prompt,
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
      temperature: 0,
      maxTokens: 80,
    }),
  })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response))
  }

  const json = (await response.json()) as { text?: string }
  const text = typeof json.text === 'string' ? json.text : ''

  const parsed = parseGrade(text)
  if (parsed !== null) {
    return parsed
  }

  const recovered = await recoverGrade(text, settings).catch(() => null)
  if (recovered !== null) {
    return recovered
  }

  // Neutral fallback keeps the UI usable even if provider output is malformed.
  return 3
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

const normalizeSummaryTitle = (value: unknown, textContent: string): string => {
  if (typeof value === 'string') {
    const cleaned = value.replace(/\s+/g, ' ').trim()
    if (cleaned) {
      return cleaned.length > 80 ? `${cleaned.slice(0, 77).trimEnd()}...` : cleaned
    }
  }

  const fallback = textContent.replace(/\s+/g, ' ').trim()
  if (!fallback) return 'Untitled'
  const words = fallback.split(' ')
  const concise = words.slice(0, 8).join(' ')
  return concise.length > 80 ? `${concise.slice(0, 77).trimEnd()}...` : concise
}

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

    const type = item.type
    const textContentCandidate =
      typeof item.text_content === 'string'
        ? item.text_content
        : typeof item.text_ === 'string'
          ? item.text_
          : typeof item.text === 'string'
            ? item.text
            : null

    if (!isNodeType(type) || typeof textContentCandidate !== 'string') {
      console.error(`[AI Service] Item ${index} has invalid fields:`, {
        type,
        isValidType: isNodeType(type),
        text_content: textContentCandidate,
        isValidContent: typeof textContentCandidate === 'string'
      })
      throw new Error('Failed to parse AI response')
    }

    const summaryTitleCandidate =
      typeof item.summary_title === 'string'
        ? item.summary_title
        : typeof item.title === 'string'
          ? item.title
          : typeof item.summary === 'string'
            ? item.summary
            : null

    return {
      type,
      text_content: textContentCandidate,
      summary_title: normalizeSummaryTitle(summaryTitleCandidate, textContentCandidate),
    }
  })
}

const formatNodeGuidance = (
  nodes: NodeSuggestionContext[],
  promptSettings: PromptSettings
): string => {
  if (nodes.length === 0) {
    return promptSettings.nextStepsNoGradedNodesText
  }

  const sorted = [...nodes].sort((a, b) => b.grade - a.grade)
  const prioritized = sorted.filter((node) => node.grade >= 4)
  const downweighted = sorted.filter((node) => node.grade === 1)

  const sections: string[] = []

  if (prioritized.length > 0) {
    sections.push(promptSettings.nodeGuidanceHighPriorityHeading)
    prioritized.slice(0, 10).forEach((node, index) => {
      sections.push(
        `${index + 1}. [${node.id}]`,
        `   ${promptSettings.nodeGuidanceTypeLabel}: ${node.type}`,
        `   ${promptSettings.nodeGuidanceContentLabel}: ${node.content}`
      )
    })
  } else {
    sections.push(promptSettings.nodeGuidanceNoHighPriorityText)
  }

  if (downweighted.length > 0) {
    sections.push(promptSettings.nodeGuidanceAvoidHeading)
    downweighted.slice(0, 10).forEach((node, index) => {
      sections.push(
        `${index + 1}. [${node.id}]`,
        `   ${promptSettings.nodeGuidanceTypeLabel}: ${node.type}`,
        `   ${promptSettings.nodeGuidanceContentLabel}: ${node.content}`
      )
    })
  }

  return sections.join('\n')
}

const buildPrompt = (
  ancestry: OMVNode[],
  globalGoal: string,
  expectedNextType: NodeType | null,
  gradedNodes: NodeSuggestionContext[]
): string => {
  const promptSettings = loadPromptSettings()
  const ancestryContext = formatAncestryForPrompt(ancestry)
  const nodesContext = formatNodeGuidance(gradedNodes, promptSettings)
  const goal = globalGoal.trim() || promptSettings.nextStepsGlobalGoalFallback
  const context = ancestryContext.trim() || promptSettings.nextStepsAncestryContextFallback
  const currentType = ancestry[ancestry.length - 1]?.type ?? 'UNKNOWN'
  const expectedType = expectedNextType ?? 'UNKNOWN'

  const experimentalConditions = formatExperimentalConditionsForPrompt(
    useStore.getState().experimentalConditions
  )

  return interpolatePromptTemplate(promptSettings.nextStepsPromptTemplate, {
    goal,
    context,
    currentType,
    expectedType,
    nodesContext,
    experimentalConditions,
  })
}

export async function generateNextSteps(
  ancestry: OMVNode[],
  globalGoal: string,
  provider: 'openai' | 'anthropic' | 'openai-compatible',
  apiKey: string,
  model?: string | null,
  baseUrl?: string | null,
  gradedNodes: NodeSuggestionContext[] = []
): Promise<GeneratedStep[]> {
  const currentNode = ancestry[ancestry.length - 1]
  const expectedNextType = currentNode ? getExpectedNextType(currentNode.type) : null
  const prompt = buildPrompt(ancestry, globalGoal, expectedNextType, gradedNodes)

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
