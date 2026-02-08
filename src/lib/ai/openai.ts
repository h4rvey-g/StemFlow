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
    content?: string
  }
  finish_reason?: string
}

interface OpenAIResponse {
  model?: string
  choices?: OpenAIChoice[]
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
  const finishReason = typeof choice?.finish_reason === 'string' ? choice.finish_reason : 'stop'
  const text = choice?.message?.content

  if (typeof text !== 'string') {
    return { text: '', finishReason: 'error', model }
  }

  return { text, finishReason, model }
}
