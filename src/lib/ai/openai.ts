import type { AiMessage, AiRequestOptions, AiResponse, OpenAiModel } from '@/lib/ai/types'

export const OPENAI_API_URL = 'https://api.openai.com/v1'
export const SUPPORTED_OPENAI_MODELS: OpenAiModel[] = ['gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo']

type OpenAIMessageContent =
  | string
  | Array<
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string } }
    >

const toOpenAIContent = (content: AiMessage['content']): OpenAIMessageContent => {
  if (typeof content === 'string') {
    return content
  }

  return content.map((part) => {
    if (part.type === 'text') {
      return { type: 'text' as const, text: part.text }
    }

    return {
      type: 'image_url' as const,
      image_url: {
        url: part.dataUrl,
      },
    }
  })
}

const toOpenAIMessages = (messages: AiRequestOptions['messages']) =>
  messages.map((message) => ({
    role: message.role,
    content: toOpenAIContent(message.content),
  }))

interface OpenAIChoice {
  message?: {
    content?: string | unknown[]
  }
  text?: string
  finish_reason?: string
}

interface OpenAIResponse {
  model?: string
  choices?: OpenAIChoice[]
  output_text?: string
  output?: unknown[]
  candidates?: unknown[]
  content?: unknown[]
  stop_reason?: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const readPartText = (part: unknown): string => {
  if (typeof part === 'string') return part
  if (!isRecord(part)) return ''
  if (typeof part.text === 'string') return part.text
  return ''
}

const extractOutputArrayText = (output: unknown): string => {
  if (!Array.isArray(output)) return ''

  const chunks: string[] = []
  for (const item of output) {
    if (!isRecord(item)) continue
    const content = item.content
    if (!Array.isArray(content)) continue

    for (const block of content) {
      if (!isRecord(block)) continue
      if (typeof block.text === 'string') {
        chunks.push(block.text)
      }
    }
  }

  return chunks.join('')
}

const extractGeminiCandidatesText = (candidates: unknown): string => {
  if (!Array.isArray(candidates) || candidates.length === 0) return ''
  const candidate = candidates[0]
  if (!isRecord(candidate)) return ''

  const content = candidate.content
  if (!isRecord(content)) return ''

  const parts = content.parts
  if (!Array.isArray(parts)) return ''

  return parts.map(readPartText).join('')
}

const extractAnthropicContentText = (content: unknown): string => {
  if (!Array.isArray(content)) return ''
  return content.map(readPartText).join('')
}

export function createOpenAIRequest(options: AiRequestOptions) {
  const body: Record<string, unknown> = {
    model: options.model,
    messages: toOpenAIMessages(options.messages),
  }

  if (typeof options.temperature === 'number') {
    body.temperature = options.temperature
  }

  if (typeof options.maxTokens === 'number') {
    body.max_tokens = options.maxTokens
  }

  if (typeof options.stream === 'boolean') {
    body.stream = options.stream
  }

  return {
    url: `${OPENAI_API_URL}/chat/completions`,
    body,
    headers: {
      'Content-Type': 'application/json',
    },
  }
}

export function parseOpenAIResponse(json: unknown): AiResponse {
  if (!json || typeof json !== 'object') {
    return { text: '', finishReason: 'error', model: 'unknown' }
  }

  const parsed = json as OpenAIResponse
  const choice = parsed.choices?.[0]
  const model = typeof parsed.model === 'string' ? parsed.model : 'unknown'
  const finishReason =
    typeof choice?.finish_reason === 'string'
      ? choice.finish_reason
      : typeof parsed.stop_reason === 'string'
        ? parsed.stop_reason
        : 'stop'

  const content = choice?.message?.content
  const text =
    typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? content.map(readPartText).join('')
        : typeof choice?.text === 'string'
          ? choice.text
          : typeof parsed.output_text === 'string'
            ? parsed.output_text
            : extractOutputArrayText(parsed.output) ||
                extractGeminiCandidatesText(parsed.candidates) ||
                extractAnthropicContentText(parsed.content)
                || null

  if (typeof text !== 'string') {
    return { text: '', finishReason: 'error', model }
  }

  return { text, finishReason, model }
}
