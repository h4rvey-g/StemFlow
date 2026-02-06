import type { AiRequestOptions, AiResponse, AnthropicModel } from '@/lib/ai/types'

export const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1'

const SYSTEM_SEPARATOR = '\n\n'

const SUPPORTED_MODELS: AnthropicModel[] = [
  'claude-3-5-sonnet-20241022',
  'claude-3-haiku-20240307',
]

const ensureAnthropicModel = (model: AiRequestOptions['model']): AnthropicModel => {
  if (SUPPORTED_MODELS.includes(model as AnthropicModel)) {
    return model as AnthropicModel
  }

  throw new Error(`Unsupported Anthropic model: ${model}`)
}

export function createAnthropicRequest(options: AiRequestOptions) {
  const model = ensureAnthropicModel(options.model)

  const systemMessages = options.messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content)

  const assistantAndUserMessages = options.messages
    .filter((message) => message.role !== 'system')
    .map((message) => ({ role: message.role as 'user' | 'assistant', content: message.content }))

  const body: {
    model: AnthropicModel
    system?: string
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
    max_tokens: number
    temperature?: number
    stream?: boolean
  } = {
    model,
    messages: assistantAndUserMessages,
    max_tokens: options.maxTokens ?? 1024,
  }

  if (systemMessages.length) {
    body.system = systemMessages.join(SYSTEM_SEPARATOR)
  }

  if (typeof options.temperature === 'number') {
    body.temperature = options.temperature
  }

  if (typeof options.stream === 'boolean') {
    body.stream = options.stream
  }

  return {
    url: `${ANTHROPIC_API_URL}/messages`,
    body,
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
    },
  }
}

interface ParsedAnthropicResponse {
  model?: string
  content?: Array<{ text?: string }>
  stop_reason?: string
}

export function parseAnthropicResponse(json: unknown): AiResponse {
  if (!json || typeof json !== 'object') {
    return { text: '', finishReason: 'stop', model: 'unknown' }
  }

  const parsed = json as ParsedAnthropicResponse
  const contentBlocks = parsed.content ?? []

  const text = contentBlocks
    .map((block) => (typeof block.text === 'string' ? block.text : ''))
    .join('')

  const finishReason = parsed.stop_reason ?? 'stop'
  const model = typeof parsed.model === 'string' ? parsed.model : 'unknown'

  return { text, finishReason, model }
}
