export type AiProvider = 'gemini' | 'openai' | 'openai-compatible' | 'anthropic'

export type GeminiModel = 'gemini-2.5-pro' | 'gemini-3-pro-preview'
export type OpenAiModel = 'gpt-4o' | 'gpt-4-turbo' | 'gpt-3.5-turbo'
export type AnthropicModel = 'claude-3-5-sonnet-20241022' | 'claude-3-haiku-20240307'

export type AiModel = GeminiModel | OpenAiModel | AnthropicModel

export interface AiMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface AiRequestOptions {
  provider: AiProvider
  model: string
  messages: AiMessage[]
  temperature?: number
  maxTokens?: number
  stream?: boolean
}

export interface AiResponse {
  text: string
  model: string
  finishReason: string
}

export interface AiStreamChunk {
  text: string
  done: boolean
}

export type AiAction = 'summarize' | 'suggest-mechanism' | 'critique' | 'expand' | 'questions'

export class AiError extends Error {
  readonly provider: AiProvider
  readonly code?: string

  constructor(message: string, provider: AiProvider, code?: string) {
    super(message)
    this.name = 'AiError'
    this.provider = provider
    this.code = code
  }
}
