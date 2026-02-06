import type { AiRequestOptions, AiResponse } from '@/lib/ai/types'

export const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta'

const mapRole = (role: AiRequestOptions['messages'][number]['role']): 'user' | 'model' =>
  role === 'assistant' ? 'model' : 'user'

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
    parts: [{ text: message.content }],
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
