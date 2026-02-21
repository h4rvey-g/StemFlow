import { loadApiKeys } from '@/lib/api-keys'
import { getModelOutputTokenLimit } from '@/lib/ai/max-tokens'
import { parseAnthropicStream, parseGeminiStream, parseOpenAIStream } from '@/lib/ai/stream-parser'
import { formatAncestryForPrompt } from '@/lib/graph'
import type { NodeSuggestionContext } from '@/lib/graph'
import type { AiMessage, AiProvider } from '@/lib/ai/types'
import type { NodeType, OMVNode, Citation } from '@/types/nodes'
import {
  interpolatePromptTemplate,
  loadPromptSettings,
  type PromptSettings,
} from '@/lib/prompt-settings'
import {
  useStore,
  formatExperimentalConditionsForPrompt,
} from '@/stores/useStore'
import { searchExa } from '@/lib/exa-search'

export interface GeneratedStep {
  type: NodeType
  text_content: string
  summary_title?: string
  citations?: Citation[]
}

interface ExaGroundedSource {
  id: string
  title: string
  url: string
  snippet?: string
  publishedDate?: string
}

const EXA_SOURCE_ID_PREFIX = 'exa:'
const EXA_MAX_SOURCES = 5
const PLANNED_DIRECTION_COUNT = 3

interface PlannedDirection {
  summary_title: string
  direction_focus: string
  search_query: string
}

interface RequestAiTextOptions {
  onStreamingRawText?: (rawText: string) => void
}

interface GenerateStepFromDirectionOptions {
  onStreamingText?: (textContent: string) => void
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
const MAX_AI_REQUEST_ATTEMPTS = 3
const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504])
const STREAM_CHUNK_TIMEOUT_MS = 15000

const isRetryableStatus = (status: number): boolean =>
  status >= 500 || RETRYABLE_STATUS_CODES.has(status)

const inferProvider = (state: Awaited<ReturnType<typeof loadApiKeys>>): AiProvider | null => {
  if (state.provider) return state.provider
  if (state.openaiKey) return 'openai'
  if (state.geminiKey) return 'gemini'
  if (state.anthropicKey) return 'anthropic'
  return null
}

type ModelMode = 'fast' | 'think'

const getProviderSettings = async (mode: ModelMode = 'think') => {
  const state = await loadApiKeys()
  const provider = inferProvider(state)
  if (!provider) {
    throw new Error('Configure an AI provider API key to enable image descriptions.')
  }

  if ((provider === 'openai' || provider === 'openai-compatible') && state.openaiKey) {
    const thinkModel = state.openaiModel || DEFAULT_OPENAI_MODEL
    return {
      provider,
      apiKey: state.openaiKey,
      model: mode === 'fast' ? (state.openaiFastModel || thinkModel) : thinkModel,
      baseUrl: state.openaiBaseUrl,
    }
  }

  if (provider === 'gemini' && state.geminiKey) {
    const thinkModel = state.geminiModel || DEFAULT_GEMINI_MODEL
    return {
      provider,
      apiKey: state.geminiKey,
      model: mode === 'fast' ? (state.geminiFastModel || thinkModel) : thinkModel,
      baseUrl: null,
    }
  }

  if (provider === 'anthropic' && state.anthropicKey) {
    const thinkModel = state.anthropicModel || DEFAULT_ANTHROPIC_MODEL
    return {
      provider,
      apiKey: state.anthropicKey,
      model: mode === 'fast' ? (state.anthropicFastModel || thinkModel) : thinkModel,
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

  const response = await requestAiResponseWithRetry(settings.provider, {
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
  }).catch((error) => {
    console.warn('[gradeNode] Recovery request failed', {
      provider: settings.provider,
      model: settings.model,
      error,
    })
    return null
  })

  if (!response) return null

  const json = (await response.json()) as { text?: string; finishReason?: string }
  const candidate = typeof json.text === 'string' ? json.text : ''
  if (!candidate.trim()) {
    console.warn('[gradeNode] Recovery returned empty candidate text', {
      provider: settings.provider,
      model: settings.model,
      finishReason: json.finishReason,
    })
    return null
  }

  const parsed = parseNumericRatingFromText(candidate)
  console.debug('[gradeNode] Recovery parse result', {
    provider: settings.provider,
    model: settings.model,
    finishReason: json.finishReason,
    candidatePreview: candidate.slice(0, 160),
    parsed,
  })
  return parsed === null ? null : parsed
}

const retryDirectGrade = async (
  settings: Awaited<ReturnType<typeof getProviderSettings>>,
  node: Pick<NodeSuggestionContext, 'id' | 'type' | 'content'>,
  goal: string,
): Promise<number | null> => {
  const response = await requestAiResponseWithRetry(settings.provider, {
    apiKey: settings.apiKey,
    model: settings.model,
    baseUrl: settings.baseUrl,
    messages: [
      {
        role: 'system',
        content:
          'Return exactly one integer from 1 to 5 for scientific node quality. No JSON, no markdown, no explanation.',
      },
      {
        role: 'user',
        content: [
          `Goal: ${goal}`,
          `Node ID: ${node.id}`,
          `Node type: ${node.type}`,
          `Node content: ${node.content}`,
          'Output only one digit (1,2,3,4,5).',
        ].join('\n'),
      },
    ],
    stream: false,
    temperature: 0,
  }).catch((error) => {
    console.warn('[gradeNode] Direct retry request failed', {
      provider: settings.provider,
      model: settings.model,
      error,
    })
    return null
  })

  if (!response) return null

  const json = (await response.json()) as { text?: string; finishReason?: string }
  const candidate = typeof json.text === 'string' ? json.text : ''
  const parsed = parseNumericRatingFromText(candidate)

  console.debug('[gradeNode] Direct retry parse result', {
    provider: settings.provider,
    model: settings.model,
    finishReason: json.finishReason,
    candidatePreview: candidate.slice(0, 120),
    parsed,
  })

  return parsed
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

const requestAiResponseWithRetry = async (
  provider: AiProvider,
  payload: Record<string, unknown>
): Promise<Response> => {
  let lastError: unknown = null

  for (let attempt = 1; attempt <= MAX_AI_REQUEST_ATTEMPTS; attempt += 1) {
    const response = await fetch(`/api/ai/${provider}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch((caught) => {
      lastError = caught
      return null
    })

    if (!response) {
      if (attempt < MAX_AI_REQUEST_ATTEMPTS) {
        continue
      }
      break
    }

    if (response.ok) {
      return response
    }

    if (attempt < MAX_AI_REQUEST_ATTEMPTS && isRetryableStatus(response.status)) {
      continue
    }

    throw new Error(await readErrorMessage(response))
  }

  const message = lastError instanceof Error ? lastError.message : 'AI request failed'
  throw new Error(message)
}

export const describeImageWithVision = async (
  imageDataUrl: string,
  contextText?: string
): Promise<string> => {
  const settings = await getProviderSettings()
  const promptSettings = loadPromptSettings()
  const maxTokens = getModelOutputTokenLimit(settings.model)

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

  const response = await requestAiResponseWithRetry(settings.provider, {
    apiKey: settings.apiKey,
    model: settings.model,
    baseUrl: settings.baseUrl,
    messages,
    stream: false,
    temperature: 0.2,
    ...(typeof maxTokens === 'number' ? { maxTokens } : {}),
  })

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
  const settings = await getProviderSettings('fast')
  const promptSettings = loadPromptSettings()
  const maxTokens = getModelOutputTokenLimit(settings.model)
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

  console.debug('[gradeNode] Starting AI grade', {
    nodeId: node.id,
    nodeType: node.type,
    provider: settings.provider,
    model: settings.model,
    contentLength: node.content.length,
  })

  const response = await requestAiResponseWithRetry(settings.provider, {
    apiKey: settings.apiKey,
    model: settings.model,
    baseUrl: settings.baseUrl,
    messages,
    stream: false,
    temperature: 0,
    ...(typeof maxTokens === 'number' ? { maxTokens } : {}),
  })

  const json = (await response.json()) as { text?: string; finishReason?: string }
  const text = typeof json.text === 'string' ? json.text : ''

  console.debug('[gradeNode] Primary response received', {
    provider: settings.provider,
    model: settings.model,
    finishReason: json.finishReason,
    textPreview: text.slice(0, 200),
    textLength: text.length,
  })

  const parsed = parseGrade(text)
  if (parsed !== null) {
    console.debug('[gradeNode] Parsed grade from primary response', {
      nodeId: node.id,
      parsed,
    })
    return parsed
  }

  console.warn('[gradeNode] Primary parse failed, attempting recovery', {
    nodeId: node.id,
    provider: settings.provider,
    model: settings.model,
  })

  const retried = await retryDirectGrade(settings, node, goal).catch(() => null)
  if (retried !== null) {
    console.debug('[gradeNode] Recovered grade from direct retry', {
      nodeId: node.id,
      retried,
    })
    return retried
  }

  console.warn('[gradeNode] Direct retry failed, attempting extraction recovery', {
    nodeId: node.id,
    provider: settings.provider,
    model: settings.model,
  })

  const recovered = await recoverGrade(text, settings).catch(() => null)
  if (recovered !== null) {
    console.debug('[gradeNode] Recovered grade from extraction prompt', {
      nodeId: node.id,
      recovered,
    })
    return recovered
  }

  // Neutral fallback keeps the UI usable even if provider output is malformed.
  console.warn('[gradeNode] Falling back to neutral grade 3', {
    nodeId: node.id,
    provider: settings.provider,
    model: settings.model,
    primaryTextPreview: text.slice(0, 200),
  })
  return 3
}

const DEFAULT_OPENAI_MODEL = 'gpt-4o'
const DEFAULT_ANTHROPIC_MODEL = 'claude-3-5-sonnet-20241022'

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

const extractPartialJsonStringField = (content: string, fieldName: string): string | null => {
  const fieldPattern = new RegExp(`"${fieldName}"\\s*:\\s*"`)
  const match = fieldPattern.exec(content)
  if (!match) {
    return null
  }

  let cursor = match.index + match[0].length
  let parsed = ''
  let isEscaped = false

  while (cursor < content.length) {
    const char = content[cursor]

    if (isEscaped) {
      if (char === 'n') parsed += '\n'
      else if (char === 'r') parsed += '\r'
      else if (char === 't') parsed += '\t'
      else if (char === 'b') parsed += '\b'
      else if (char === 'f') parsed += '\f'
      else if (char === 'u') {
        const unicode = content.slice(cursor + 1, cursor + 5)
        if (/^[0-9a-fA-F]{4}$/.test(unicode)) {
          parsed += String.fromCharCode(Number.parseInt(unicode, 16))
          cursor += 4
        } else {
          parsed += 'u'
        }
      } else {
        parsed += char
      }

      isEscaped = false
      cursor += 1
      continue
    }

    if (char === '\\') {
      isEscaped = true
      cursor += 1
      continue
    }

    if (char === '"') {
      return parsed
    }

    parsed += char
    cursor += 1
  }

  return parsed || null
}

const extractStreamingGeneratedTextContent = (content: string): string | null => {
  return (
    extractPartialJsonStringField(content, 'text_content') ??
    extractPartialJsonStringField(content, 'text_') ??
    extractPartialJsonStringField(content, 'text')
  )
}

/**
 * Attempt to salvage complete JSON objects from a truncated JSON array.
 * Walks backwards from the end looking for the last `}`, then tries
 * closing the array at that position. Repeats until a valid parse succeeds
 * or no more `}` candidates remain.
 */
const repairTruncatedJsonArray = (raw: string): unknown[] | null => {
  const startIdx = raw.indexOf('[')
  if (startIdx === -1) return null

  const body = raw.slice(startIdx)
  let searchFrom = body.length - 1

  while (searchFrom > 0) {
    const braceIdx = body.lastIndexOf('}', searchFrom)
    if (braceIdx === -1) break

    const candidate = body.slice(0, braceIdx + 1) + ']'
    try {
      const parsed: unknown = JSON.parse(candidate)
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
      }
    } catch {}
    searchFrom = braceIdx - 1
  }

  return null
}

const toExaSourceId = (value: unknown): string | null => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return `${EXA_SOURCE_ID_PREFIX}${Math.floor(value)}`
  }

  if (typeof value !== 'string') return null
  const trimmed = value.trim().toLowerCase()
  if (!trimmed) return null

  const explicit = trimmed.match(/^exa:(\d+)$/)
  if (explicit) {
    return `${EXA_SOURCE_ID_PREFIX}${explicit[1]}`
  }

  const numeric = trimmed.match(/^(\d+)$/)
  if (numeric) {
    return `${EXA_SOURCE_ID_PREFIX}${numeric[1]}`
  }

  return null
}

const uniqueStrings = (values: string[]): string[] => {
  const seen = new Set<string>()
  const output: string[] = []

  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value)
      output.push(value)
    }
  }

  return output
}

const collectRegexMatches = (text: string, pattern: RegExp): string[] => {
  const matches: string[] = []
  let match = pattern.exec(text)

  while (match) {
    if (typeof match[1] === 'string' && match[1].trim() !== '') {
      matches.push(match[1])
    }
    match = pattern.exec(text)
  }

  return matches
}

const extractInlineExaSourceIds = (text: string): string[] => {
  const refs: string[] = []

  const explicitDouble = collectRegexMatches(text, /\[\[\s*(exa:\d+)\s*\]\]/gi)
  refs.push(...explicitDouble.map((value) => value.toLowerCase()))

  const explicitSingle = collectRegexMatches(text, /\[\s*(exa:\d+)\s*\]/gi)
  refs.push(...explicitSingle.map((value) => value.toLowerCase()))

  const numericRefs = collectRegexMatches(text, /\[(\d+)\]/g)
  refs.push(...numericRefs.map((value) => `${EXA_SOURCE_ID_PREFIX}${value}`))

  const numericRefGroups = collectRegexMatches(text, /\[((?:\s*\d+\s*,)+\s*\d+\s*)\]/g)
  for (const group of numericRefGroups) {
    const ids = group
      .split(',')
      .map((part) => part.trim())
      .filter((part) => /^\d+$/.test(part))

    refs.push(...ids.map((value) => `${EXA_SOURCE_ID_PREFIX}${value}`))
  }

  return uniqueStrings(refs)
}

const extractLegacyCitationIndexSourceIds = (item: Record<string, unknown>): string[] => {
  if (!Array.isArray(item.citations)) return []

  const refs: string[] = []
  for (const citation of item.citations) {
    if (typeof citation !== 'object' || citation === null) continue

    const record = citation as Record<string, unknown>
    const fromIndex = toExaSourceId(record.index)
    if (fromIndex) {
      refs.push(fromIndex)
      continue
    }

    const fromRef = toExaSourceId(record.ref)
    if (fromRef) refs.push(fromRef)
  }

  return uniqueStrings(refs)
}

const extractModelExaSourceIds = (item: Record<string, unknown>): string[] => {
  const candidates: unknown[] = [
    item.exa_citations,
    item.exaCitationIds,
    item.citation_refs,
    item.citationRefs,
  ]

  const refs: string[] = []
  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue
    for (const entry of candidate) {
      const id = toExaSourceId(entry)
      if (id) refs.push(id)
    }
  }

  return uniqueStrings(refs)
}

const toCitationIndex = (sourceId: string, fallbackIndex: number): number => {
  const numeric = sourceId.match(/^exa:(\d+)$/i)
  if (!numeric) return fallbackIndex
  const parsed = Number(numeric[1])
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackIndex
}

const mapExaSourceIdsToCitations = (
  sourceIds: string[],
  exaSourcesById: Map<string, ExaGroundedSource>
): Citation[] => {
  const citations: Citation[] = []

  for (let i = 0; i < sourceIds.length; i += 1) {
    const source = exaSourcesById.get(sourceIds[i])
    if (!source) continue

    const citation: Citation = {
      index: toCitationIndex(source.id, i + 1),
      title: source.title,
      url: source.url,
    }

    if (source.snippet) citation.snippet = source.snippet
    if (source.publishedDate) citation.publishedDate = source.publishedDate

    citations.push(citation)
  }

  return citations
}

const buildExaSearchQuery = (ancestry: OMVNode[], globalGoal: string): string => {
  const latestNode = ancestry[ancestry.length - 1]
  const latestText = latestNode?.data?.text_content?.trim() || ''
  const goal = globalGoal.trim()

  if (goal && latestText) {
    return `${goal}\n\nContext: ${latestText.slice(0, 500)}`
  }

  if (goal) return goal
  if (latestText) return latestText.slice(0, 500)
  return 'scientific research evidence'
}

const buildFallbackDirections = (
  ancestry: OMVNode[],
  globalGoal: string,
  expectedNextType: NodeType | null
): PlannedDirection[] => {
  const baseQuery = buildExaSearchQuery(ancestry, globalGoal)
  const nextType = expectedNextType ?? 'OBSERVATION'
  const latestNode = ancestry[ancestry.length - 1]
  const latestContext = latestNode?.data?.text_content?.trim().slice(0, 180) ?? ''
  const contextSuffix = latestContext ? ` Context: ${latestContext}` : ''

  return [
    {
      summary_title: `${nextType} direction A`,
      direction_focus: `Primary ${nextType.toLowerCase()} path grounded in current goal and context.`,
      search_query: `${baseQuery} ${nextType.toLowerCase()} evidence recent review`.trim(),
    },
    {
      summary_title: `${nextType} direction B`,
      direction_focus: `Alternative ${nextType.toLowerCase()} path using orthogonal method or dataset.${contextSuffix}`,
      search_query: `${baseQuery} ${nextType.toLowerCase()} alternative method benchmark`.trim(),
    },
    {
      summary_title: `${nextType} direction C`,
      direction_focus: `Risk-aware ${nextType.toLowerCase()} path emphasizing confounders and controls.${contextSuffix}`,
      search_query: `${baseQuery} ${nextType.toLowerCase()} confounders controls reproducibility`.trim(),
    },
  ]
}

const buildExaSources = async (query: string): Promise<ExaGroundedSource[]> => {
  const response = await searchExa(query, { numResults: EXA_MAX_SOURCES })
  if (response.results.length === 0) return []

  const sources = response.results
    .filter((result) => result.title.trim() !== '' && result.url.trim() !== '')
    .slice(0, EXA_MAX_SOURCES)
    .map((result, index) => ({
      id: `${EXA_SOURCE_ID_PREFIX}${index + 1}`,
      title: result.title.trim(),
      url: result.url.trim(),
      snippet: result.text?.trim() || undefined,
      publishedDate: result.publishedDate?.trim() || undefined,
    }))

  return sources
}

const formatExaSourcesForPrompt = (sources: ExaGroundedSource[]): string => {
  if (sources.length === 0) {
    return [
      'Web search returned no usable Exa sources.',
      'Do not invent citations. Return steps without exa_citations.',
    ].join('\n')
  }

  const lines: string[] = [
    'Authoritative Exa sources (use only these for citations):',
  ]

  for (const source of sources) {
    lines.push(`- id: ${source.id}`)
    lines.push(`  title: ${source.title}`)
    lines.push(`  url: ${source.url}`)
    if (source.publishedDate) lines.push(`  publishedDate: ${source.publishedDate}`)
    if (source.snippet) lines.push(`  snippet: ${source.snippet}`)
  }

  lines.push('Citation rules:')
  lines.push('- Every citation must reference Exa IDs only (exa:1, exa:2, ...).')
  lines.push('- Put IDs in exa_citations array per step (e.g. ["exa:1", "exa:2"]).')
  lines.push('- Do not generate citation title/url/snippet fields yourself.')

  return lines.join('\n')
}

const parsePlannedDirections = (payload: unknown, minCount: number = PLANNED_DIRECTION_COUNT): PlannedDirection[] => {
  const list = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.directions)
      ? payload.directions
      : null

  if (!list || list.length === 0) {
    throw new Error('Failed to parse AI response')
  }

  const directions: PlannedDirection[] = []

  for (const item of list) {
    if (!isRecord(item)) continue

    const summaryTitleRaw =
      typeof item.summary_title === 'string'
        ? item.summary_title
        : typeof item.title === 'string'
          ? item.title
          : ''

    const directionFocusRaw =
      typeof item.direction_focus === 'string'
        ? item.direction_focus
        : typeof item.focus === 'string'
          ? item.focus
          : typeof item.rationale === 'string'
            ? item.rationale
            : ''

    const searchQueryRaw =
      typeof item.search_query === 'string'
        ? item.search_query
        : typeof item.query === 'string'
          ? item.query
          : typeof item.search === 'string'
            ? item.search
            : ''

    const searchQuery = searchQueryRaw.replace(/\s+/g, ' ').trim()
    if (!searchQuery) continue

    const directionFocus = directionFocusRaw.replace(/\s+/g, ' ').trim() || 'Direction-specific scientific next step.'
    const summaryTitle = normalizeSummaryTitle(summaryTitleRaw, directionFocus)

    directions.push({
      summary_title: summaryTitle,
      direction_focus: directionFocus,
      search_query: searchQuery,
    })

    if (directions.length >= PLANNED_DIRECTION_COUNT) {
      break
    }
  }

  if (directions.length < minCount) {
    throw new Error(`AI returned fewer than ${minCount} planned directions`)
  }

  return directions
}

const requestAiText = async (
  provider: 'openai' | 'anthropic' | 'openai-compatible',
  apiKey: string,
  modelName: string,
  baseUrl: string | null | undefined,
  messages: AiMessage[],
  temperature: number,
  maxTokens?: number,
  options?: RequestAiTextOptions
): Promise<{ text: string; finishReason: string; responseModel: string }> => {
  const streamParser =
    provider === 'anthropic'
      ? parseAnthropicStream
      : provider === 'openai' || provider === 'openai-compatible'
        ? parseOpenAIStream
        : parseGeminiStream

  const parseJsonTextResponse = async (response: Response): Promise<{ text: string; finishReason: string; responseModel: string }> => {
    const json = (await response.json()) as {
      text?: string
      finishReason?: string
      model?: string
    }

    return {
      text: typeof json.text === 'string' ? json.text : '',
      finishReason: typeof json.finishReason === 'string' ? json.finishReason : 'unknown',
      responseModel: typeof json.model === 'string' ? json.model : modelName,
    }
  }

  const readSseTextResponse = async (
    response: Response,
    onChunk?: (text: string, chunkText: string) => void
  ): Promise<string> => {
    const reader = response.body?.getReader()
    if (!reader) {
      return ''
    }

    let text = ''
    const iterator = streamParser(reader)[Symbol.asyncIterator]()

    while (true) {
      const chunkResult = await nextStreamChunkWithTimeout(
        iterator,
        STREAM_CHUNK_TIMEOUT_MS,
        () => {
          void reader.cancel('stream-timeout')
        }
      )

      if (chunkResult.done) break
      const chunk = chunkResult.value
      if (chunk.done) break

      text += chunk.text
      onChunk?.(text, chunk.text)
    }

    return text
  }

  const basePayload = {
    apiKey,
    model: modelName,
    baseUrl: baseUrl || undefined,
    messages,
    temperature,
    ...(typeof maxTokens === 'number' ? { maxTokens } : {}),
  }

  const requestNonStreamingFallback = async (): Promise<{ text: string; finishReason: string; responseModel: string }> => {
    const fallbackResponse = await requestAiResponseWithRetry(provider, {
      ...basePayload,
      stream: false,
    })

    const fallbackContentType = fallbackResponse.headers.get('content-type') || ''
    const fallbackIsSse = fallbackContentType.includes('text/event-stream')

    if (fallbackIsSse) {
      if (hasStreamingObserver) {
        console.warn('[AI Service] Non-stream fallback returned SSE, parsing streamed fallback content', {
          provider,
          modelName,
          contentType: fallbackContentType,
        })
      }

      const text = await readSseTextResponse(fallbackResponse)
      if (!text.trim()) {
        throw new Error('AI fallback stream returned no content')
      }

      return {
        text,
        finishReason: 'unknown',
        responseModel: modelName,
      }
    }

    return parseJsonTextResponse(fallbackResponse)
  }

  const nextStreamChunkWithTimeout = async <T>(
    iterator: AsyncIterator<T>,
    timeoutMs: number,
    onTimeout: () => void
  ): Promise<IteratorResult<T>> => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    try {
      return await Promise.race([
        iterator.next(),
        new Promise<IteratorResult<T>>((_, reject) => {
          timeoutId = setTimeout(() => {
            onTimeout()
            reject(new Error('AI stream timed out'))
          }, timeoutMs)
        }),
      ])
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }

  const aiStreamingEnabled = (await loadApiKeys()).aiStreamingEnabled ?? true
  const hasStreamingObserver = typeof options?.onStreamingRawText === 'function'

  if (aiStreamingEnabled && hasStreamingObserver) {
    console.info('[AI Service] Streaming enabled for generation request', {
      provider,
      modelName,
    })
  } else if (!aiStreamingEnabled && hasStreamingObserver) {
    console.info('[AI Service] Streaming disabled, using non-streaming generation request', {
      provider,
      modelName,
    })
  }

  const response = await requestAiResponseWithRetry(provider, {
    ...basePayload,
    stream: aiStreamingEnabled,
  })

  const contentType = response.headers.get('content-type') || ''
  const isSseStream = contentType.includes('text/event-stream')

  if (aiStreamingEnabled && isSseStream && response.body) {
    let receivedStreamingChunk = false
    let text = ''

    try {
      text = await readSseTextResponse(response, (streamedText, chunkText) => {
        if (hasStreamingObserver && chunkText.length > 0 && !receivedStreamingChunk) {
          receivedStreamingChunk = true
          console.info('[AI Service] Streaming content is flowing', {
            provider,
            modelName,
          })
        }
        options?.onStreamingRawText?.(streamedText)
      })
    } catch (error) {
      console.warn('[AI Service] Stream parsing failed, retrying as non-stream response', {
        provider,
        modelName,
        error,
      })
      return requestNonStreamingFallback()
    }

    if (!text.trim()) {
      if (hasStreamingObserver) {
        console.warn('[AI Service] Streaming produced no content, switching to non-stream fallback', {
          provider,
          modelName,
        })
      }
      return requestNonStreamingFallback()
    }

    if (hasStreamingObserver) {
      console.info('[AI Service] Streaming generation completed with content', {
        provider,
        modelName,
        textLength: text.length,
      })
    }

    return {
      text,
      finishReason: 'unknown',
      responseModel: modelName,
    }
  }

  if (aiStreamingEnabled && !isSseStream && hasStreamingObserver) {
    console.warn('[AI Service] Stream requested but SSE response unavailable, parsing JSON response', {
      provider,
      modelName,
      contentType,
    })
  }

  return parseJsonTextResponse(response)
}

const buildPlannerPrompt = (
  ancestry: OMVNode[],
  globalGoal: string,
  expectedNextType: NodeType | null,
  gradedNodes: NodeSuggestionContext[]
): string => {
  const promptSettings = loadPromptSettings()
  const ancestryContext = formatAncestryForPrompt(ancestry).trim() || promptSettings.nextStepsAncestryContextFallback
  const goal = globalGoal.trim() || promptSettings.nextStepsGlobalGoalFallback
  const currentType = ancestry[ancestry.length - 1]?.type ?? 'UNKNOWN'
  const expectedType = expectedNextType ?? 'UNKNOWN'
  const nodesContext = formatNodeGuidance(gradedNodes, promptSettings)
  const experimentalConditions = formatExperimentalConditionsForPrompt(
    useStore.getState().experimentalConditions
  )

  return [
    'Plan exactly 3 distinct scientific next-step directions and concise web search queries.',
    'Return ONLY valid JSON array (no markdown).',
    'Each item must include:',
    '- summary_title (3-8 words)',
    '- direction_focus (one concise sentence)',
    '- search_query (single-line, specific, <= 20 words, no full context dump)',
    'All three directions must be meaningfully different and aligned to expected type.',
    '',
    `Goal: ${goal}`,
    `Experimental Conditions: ${experimentalConditions}`,
    `Ancestry Context: ${ancestryContext}`,
    `Current Node Type: ${currentType}`,
    `Expected Next Node Type: ${expectedType}`,
    `Graded Node Context: ${nodesContext}`,
  ].join('\n')
}

const buildDirectionPrompt = (
  promptBase: string,
  direction: PlannedDirection,
  exaSources: ExaGroundedSource[]
): string => {
  return [
    promptBase,
    '',
    '## Direction Constraint',
    `summary_title: ${direction.summary_title}`,
    `direction_focus: ${direction.direction_focus}`,
    'In this call, generate exactly ONE suggestion aligned to the direction_focus above.',
    'Output must be a JSON array with exactly one object.',
    '',
    '## Citation Grounding Contract',
    formatExaSourcesForPrompt(exaSources),
  ].join('\n')
}

const toGeneratedSteps = (
  payload: unknown,
  exaSourcesById: Map<string, ExaGroundedSource>
): GeneratedStep[] => {
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

    const modelRefIds = extractModelExaSourceIds(item)
    const inlineRefIds = extractInlineExaSourceIds(textContentCandidate)
    const legacyRefIds = extractLegacyCitationIndexSourceIds(item)
    const refIds = uniqueStrings([...modelRefIds, ...inlineRefIds, ...legacyRefIds]).filter((id) => exaSourcesById.has(id))
    const citations = mapExaSourceIdsToCitations(refIds, exaSourcesById)

    console.log(
      `[toGeneratedSteps] Item ${index} Exa refs:`,
      refIds,
      '| grounded citations:',
      citations.length
    )

    const step: GeneratedStep = {
      type,
      text_content: textContentCandidate,
      summary_title: normalizeSummaryTitle(summaryTitleCandidate, textContentCandidate),
    }

    if (citations.length > 0) {
      step.citations = citations
    }

    return step
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

  const generationPromptTemplate =
    expectedNextType === 'MECHANISM'
      ? promptSettings.nextStepsObservationToMechanismPromptTemplate
      : expectedNextType === 'VALIDATION'
        ? promptSettings.nextStepsMechanismToValidationPromptTemplate
        : promptSettings.nextStepsObservationToMechanismPromptTemplate

  const experimentalConditions = formatExperimentalConditionsForPrompt(
    useStore.getState().experimentalConditions
  )

  return interpolatePromptTemplate(generationPromptTemplate, {
    goal,
    context,
    currentType,
    expectedType,
    nodesContext,
    experimentalConditions,
  })
}

/**
 * Phase 1: Planner Preview
 * Generates lightweight research directions to populate ghost nodes.
 * This split reduces latency by deferring heavy content generation until a path is chosen.
 */
export async function planNextDirections(
  ancestry: OMVNode[],
  globalGoal: string,
  provider: 'openai' | 'anthropic' | 'openai-compatible',
  apiKey: string,
  model?: string | null,
  baseUrl?: string | null,
  gradedNodes: NodeSuggestionContext[] = []
): Promise<import('@/types/nodes').PlannerDirectionPreview[]> {
  const currentNode = ancestry[ancestry.length - 1]
  const expectedNextType = currentNode ? getExpectedNextType(currentNode.type) : null
  const modelName = model || (provider === 'anthropic' ? DEFAULT_ANTHROPIC_MODEL : DEFAULT_OPENAI_MODEL)
  const plannerMaxTokens = getModelOutputTokenLimit(modelName)

  const plannerResponse = await requestAiText(
    provider,
    apiKey,
    modelName,
    baseUrl,
    [
      {
        role: 'system',
        content: 'You are a scientific research planner. Output strict JSON only.',
      },
      {
        role: 'user',
        content: buildPlannerPrompt(ancestry, globalGoal, expectedNextType, gradedNodes),
      },
    ],
    0.2,
    plannerMaxTokens
  )

  let plannedDirections: PlannedDirection[]
  try {
    const plannerPayload = extractJsonPayload(plannerResponse.text)
    plannedDirections = parsePlannedDirections(JSON.parse(plannerPayload))
  } catch (parseError) {
    if (plannerResponse.finishReason === 'length') {
      const repaired = repairTruncatedJsonArray(plannerResponse.text)
      if (repaired) {
        try {
          plannedDirections = parsePlannedDirections(repaired, 1)
        } catch {
          throw parseError
        }
      } else {
        throw parseError
      }
    } else {
      throw parseError
    }
  }

  const suggestedType = (expectedNextType ?? 'OBSERVATION') as import('@/types/nodes').PlannerDirectionType
  const sourceNodeId = currentNode?.id

  return plannedDirections.map((dir) => ({
    id: `planner-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    summary_title: dir.summary_title,
    suggestedType,
    searchQuery: dir.search_query,
    ...(sourceNodeId ? { sourceNodeId } : {}),
  }))
}

/**
 * Phase 2: Accept-Time Generation
 * Generates full node content grounded in literature for a specific chosen direction.
 */
export async function generateStepFromDirection(
  direction: import('@/types/nodes').PlannerDirectionPreview,
  ancestry: OMVNode[],
  globalGoal: string,
  provider: 'openai' | 'anthropic' | 'openai-compatible',
  apiKey: string,
  model?: string | null,
  baseUrl?: string | null,
  gradedNodes: NodeSuggestionContext[] = [],
  options?: GenerateStepFromDirectionOptions
): Promise<GeneratedStep> {
  const currentNode = ancestry[ancestry.length - 1]
  const expectedNextType = currentNode ? getExpectedNextType(currentNode.type) : null
  const promptBase = buildPrompt(ancestry, globalGoal, expectedNextType, gradedNodes)
  const modelName = model || (provider === 'anthropic' ? DEFAULT_ANTHROPIC_MODEL : DEFAULT_OPENAI_MODEL)
  const maxTokens = getModelOutputTokenLimit(modelName)

  const plannedDirection: PlannedDirection = {
    summary_title: direction.summary_title,
    direction_focus: direction.summary_title,
    search_query: direction.searchQuery,
  }

  try {
    const exaSources = await buildExaSources(direction.searchQuery).catch(() => [])
    const exaSourcesById = new Map(exaSources.map((source) => [source.id, source]))
    let lastStreamedTextContent = ''

    const directionResponse = await requestAiText(
      provider,
      apiKey,
      modelName,
      baseUrl,
      [
        {
          role: 'system',
          content: 'You are a scientific research assistant. Follow the requested output format exactly.',
        },
        {
          role: 'user',
          content: buildDirectionPrompt(promptBase, plannedDirection, exaSources),
        },
      ],
      0.4,
      maxTokens,
      {
        onStreamingRawText: (rawText) => {
          if (!options?.onStreamingText) {
            return
          }

          const streamingTextContent = extractStreamingGeneratedTextContent(rawText)
          if (!streamingTextContent || streamingTextContent === lastStreamedTextContent) {
            return
          }

          lastStreamedTextContent = streamingTextContent
          options.onStreamingText(streamingTextContent)
        },
      }
    )

    let parsed: unknown
    try {
      const payload = extractJsonPayload(directionResponse.text)
      parsed = JSON.parse(payload)
    } catch (parseError) {
      console.error('[AI Service] generateStepFromDirection JSON parse failed', {
        provider,
        modelName,
        finishReason: directionResponse.finishReason,
        error: parseError instanceof Error ? parseError.message : String(parseError),
        contentPreview: directionResponse.text.slice(0, 400),
      })
      throw parseError
    }

    const steps = toGeneratedSteps(parsed, exaSourcesById)
    const step = steps[0]

    if (!step) {
      throw new Error('Failed to parse AI response')
    }

    const rawItem = Array.isArray(parsed) ? parsed[0] : null
    const aiProvidedTitle =
      isRecord(rawItem) &&
      (typeof rawItem.summary_title === 'string' ||
        typeof rawItem.title === 'string' ||
        typeof rawItem.summary === 'string')

    if (!aiProvidedTitle) {
      step.summary_title = direction.summary_title
    }

    return expectedNextType ? { ...step, type: expectedNextType } : step
  } catch (error) {
    if (error instanceof Error) {
      if (
        error.message.includes('401') ||
        error.message.includes('403') ||
        error.message.includes('API key') ||
        error.message.toLowerCase().includes('unauthorized') ||
        error.message.toLowerCase().includes('forbidden')
      ) {
        throw new Error('Invalid API key')
      }
      if (
        error.message.includes('429') ||
        error.message.toLowerCase().includes('rate limit') ||
        error.message.toLowerCase().includes('too many requests')
      ) {
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
  const promptBase = buildPrompt(ancestry, globalGoal, expectedNextType, gradedNodes)

  try {
    const modelName = model || (provider === 'anthropic' ? DEFAULT_ANTHROPIC_MODEL : DEFAULT_OPENAI_MODEL)
    const plannerMaxTokens = getModelOutputTokenLimit(modelName)
    const plannerResponse = await requestAiText(
      provider,
      apiKey,
      modelName,
      baseUrl,
      [
        {
          role: 'system',
          content: 'You are a scientific research planner. Output strict JSON only.',
        },
        {
          role: 'user',
          content: buildPlannerPrompt(ancestry, globalGoal, expectedNextType, gradedNodes),
        },
      ],
      0.2,
      plannerMaxTokens
    )
    const plannerText = plannerResponse.text

    let plannedDirections: PlannedDirection[] | undefined
    try {
      const plannerPayload = extractJsonPayload(plannerText)
      plannedDirections = parsePlannedDirections(JSON.parse(plannerPayload))
    } catch (parseError) {
      const plannerPayload = extractJsonPayload(plannerText)

      if (plannerResponse.finishReason === 'length') {
        const repaired = repairTruncatedJsonArray(plannerText)
        if (repaired) {
          try {
            plannedDirections = parsePlannedDirections(repaired, 1)
            console.warn('[AI Service] Planner response truncated, salvaged', plannedDirections.length, 'direction(s)')
          } catch {
            console.error('[AI Service] Planner truncated JSON repair failed')
          }
        }
      }

      if (!plannedDirections) {
        console.error('[AI Service] Planner JSON parse failed', {
          provider,
          modelName,
          plannerTemperature: 0.2,
          plannerMaxTokens,
          plannerFinishReason: plannerResponse.finishReason,
          plannerResponseModel: plannerResponse.responseModel,
          error: parseError instanceof Error ? parseError.message : String(parseError),
          plannerTextLength: plannerText.length,
          plannerPayloadLength: plannerPayload.length,
          plannerPayloadStartsWithBracket: plannerPayload.trimStart().startsWith('['),
          plannerPayloadEndsWithBracket: plannerPayload.trimEnd().endsWith(']'),
          plannerTextPreview: plannerText.slice(0, 800),
          plannerTextTail: plannerText.slice(-160),
          plannerPayloadPreview: plannerPayload.slice(0, 400),
          plannerPayloadTail: plannerPayload.slice(-160),
        })
        throw parseError
      }
    }

    const exaSourceGroups = await Promise.all(
      plannedDirections.map((direction) => buildExaSources(direction.search_query).catch(() => []))
    )

    const generatedByDirection = await Promise.all(
      plannedDirections.map(async (direction, index) => {
        const exaSources = exaSourceGroups[index]
        const exaSourcesById = new Map(exaSources.map((source) => [source.id, source]))
        const directionMaxTokens = getModelOutputTokenLimit(modelName)
        const directionResponse = await requestAiText(
          provider,
          apiKey,
          modelName,
          baseUrl,
          [
            {
              role: 'system',
              content: 'You are a scientific research assistant. Follow the requested output format exactly.',
            },
            {
              role: 'user',
              content: buildDirectionPrompt(promptBase, direction, exaSources),
            },
          ],
          0.4,
          directionMaxTokens
        )
        const content = directionResponse.text

        let parsed: unknown
        try {
          const directionPayload = extractJsonPayload(content)
          parsed = JSON.parse(directionPayload)
        } catch (parseError) {
          const directionPayload = extractJsonPayload(content)
          console.error('[AI Service] Direction JSON parse failed', {
            directionIndex: index,
            provider,
            modelName,
            directionTemperature: 0.4,
            directionMaxTokens,
            directionFinishReason: directionResponse.finishReason,
            directionResponseModel: directionResponse.responseModel,
            summaryTitle: direction.summary_title,
            searchQuery: direction.search_query,
            error: parseError instanceof Error ? parseError.message : String(parseError),
            contentLength: content.length,
            directionPayloadLength: directionPayload.length,
            directionPayloadStartsWithBracket: directionPayload.trimStart().startsWith('['),
            directionPayloadEndsWithBracket: directionPayload.trimEnd().endsWith(']'),
            contentPreview: content.slice(0, 800),
            contentTail: content.slice(-160),
            directionPayloadPreview: directionPayload.slice(0, 400),
            directionPayloadTail: directionPayload.slice(-160),
          })
          throw parseError
        }
        const directionSteps = toGeneratedSteps(parsed, exaSourcesById)
        const firstStep = directionSteps[0]

        if (!firstStep) {
          throw new Error('Failed to parse AI response')
        }

        if (!firstStep.summary_title?.trim()) {
          firstStep.summary_title = direction.summary_title
        }

        return firstStep
      })
    )

    const steps = generatedByDirection.filter(Boolean)

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
