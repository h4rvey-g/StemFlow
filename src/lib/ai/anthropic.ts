import type { AiMessage, AiRequestOptions, AiResponse, AnthropicModel } from '@/lib/ai/types'

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

type AnthropicImageBlock = {
  type: 'image'
  source: {
    type: 'base64'
    media_type: string
    data: string
  }
}

type AnthropicTextBlock = {
  type: 'text'
  text: string
}

type AnthropicMessageContent = string | Array<AnthropicTextBlock | AnthropicImageBlock>

const parseDataUrl = (dataUrl: string): { mimeType: string; base64: string } | null => {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) return null

  return {
    mimeType: match[1],
    base64: match[2],
  }
}

const toAnthropicText = (content: AiMessage['content']): string => {
  if (typeof content === 'string') {
    return content
  }

  return content
    .map((part) => (part.type === 'text' ? part.text : '[Image attachment]'))
    .join('\n')
}

const toAnthropicContent = (content: AiMessage['content']): AnthropicMessageContent => {
  if (typeof content === 'string') {
    return content
  }

  const blocks = content
    .map((part): AnthropicTextBlock | AnthropicImageBlock | null => {
      if (part.type === 'text') {
        return { type: 'text', text: part.text }
      }

      const parsed = parseDataUrl(part.dataUrl)
      if (!parsed) {
        return {
          type: 'text',
          text: '[Image attachment could not be parsed]',
        }
      }

      return {
        type: 'image',
        source: {
          type: 'base64',
          media_type: parsed.mimeType,
          data: parsed.base64,
        },
      }
    })
    .filter((block): block is AnthropicTextBlock | AnthropicImageBlock => block !== null)

  return blocks.length === 1 && blocks[0].type === 'text' ? blocks[0].text : blocks
}

export function createAnthropicRequest(options: AiRequestOptions) {
  const model = ensureAnthropicModel(options.model)

  const systemMessages = options.messages
    .filter((message) => message.role === 'system')
    .map((message) => toAnthropicText(message.content))

  const assistantAndUserMessages = options.messages
    .filter((message) => message.role !== 'system')
    .map((message) => ({
      role: message.role as 'user' | 'assistant',
      content: toAnthropicContent(message.content),
    }))

  const body: {
    model: AnthropicModel
    system?: string
    messages: Array<{ role: 'user' | 'assistant'; content: AnthropicMessageContent }>
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
