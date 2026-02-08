import type { AiRequestOptions, AiResponse } from '@/lib/ai/types'

export const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta'

const mapRole = (role: AiRequestOptions['messages'][number]['role']): 'user' | 'model' =>
  role === 'assistant' ? 'model' : 'user'

type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } }

const parseDataUrl = (dataUrl: string): { mimeType: string; base64: string } | null => {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) return null

  return {
    mimeType: match[1],
    base64: match[2],
  }
}

const toGeminiParts = (content: AiRequestOptions['messages'][number]['content']): GeminiPart[] => {
  if (typeof content === 'string') {
    return [{ text: content }]
  }

  const parts = content
    .map((part): GeminiPart | null => {
      if (part.type === 'text') {
        return { text: part.text }
      }

      const parsed = parseDataUrl(part.dataUrl)
      if (!parsed) {
        return { text: '[Image attachment could not be parsed]' }
      }

      return {
        inlineData: {
          mimeType: parsed.mimeType,
          data: parsed.base64,
        },
      }
    })
    .filter((part): part is GeminiPart => part !== null)

  return parts.length > 0 ? parts : [{ text: '' }]
}

interface GeminiResponseCandidate {
  metadata?: { finishReason?: string }
  content?: { parts?: Array<{ text?: string }> }
}

interface ParsedGeminiResponse {
  model?: string
  candidates?: GeminiResponseCandidate[]
}

export function createGeminiRequest(options: AiRequestOptions) {
  const base = `${GEMINI_API_URL}/models/${options.model}`
  const url = options.stream
    ? `${base}:streamGenerateContent?alt=sse`
    : `${base}:generateContent`

  const contents = options.messages.map((message) => ({
    role: mapRole(message.role),
    parts: toGeminiParts(message.content),
  }))

  const generationConfig: Record<string, number> = {}
  if (typeof options.temperature === 'number') {
    generationConfig.temperature = options.temperature
  }

  if (typeof options.maxTokens === 'number') {
    generationConfig.maxOutputTokens = options.maxTokens
  }

  return {
    url,
    body: {
      contents,
      generationConfig,
    },
    headers: { 'Content-Type': 'application/json' },
  }
}

export function parseGeminiResponse(json: unknown): AiResponse {
  if (!json || typeof json !== 'object') {
    return { text: '', finishReason: 'stop', model: 'unknown' }
  }

  const parsed = json as ParsedGeminiResponse
  const candidate = parsed.candidates?.[0]
  const parts = candidate?.content?.parts ?? []
  const text = parts
    .map((part) => (typeof part.text === 'string' ? part.text : ''))
    .join('')

  const finishReason = candidate?.metadata?.finishReason ?? 'stop'
  const model = typeof parsed.model === 'string' ? parsed.model : 'unknown'

  return { text, finishReason, model }
}
