import { APICallError, generateText, streamText } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import type { AiProvider, AiMessage } from '@/lib/ai/types'
import type { LanguageModel } from 'ai'

export const dynamic = 'force-dynamic'

type Params = { provider: string }

type RequestBody = {
  apiKey?: string
  model?: string
  messages?: AiMessage[]
  temperature?: number
  maxTokens?: number
  stream?: boolean
  baseUrl?: string
}

const isProvider = (value: string): value is AiProvider =>
  value === 'gemini' || value === 'openai' || value === 'openai-compatible' || value === 'anthropic'

const normalizeBaseUrl = (value?: string): string | null => {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.replace(/\/+$/, '')
}

const jsonError = (message: string, status: number) =>
  Response.json({ error: message }, { status })
const buildProviderModel = (
  provider: AiProvider,
  apiKey: string,
  model: string,
  baseUrl?: string | null
): LanguageModel => {
  if (provider === 'gemini') {
    return createGoogleGenerativeAI({ apiKey })(model)
  }
  if (provider === 'openai') {
    return createOpenAI({ apiKey })(model)
  }
  if (provider === 'openai-compatible') {
    return createOpenAI({
      apiKey,
      baseURL: baseUrl ?? undefined,
    })(model)
  }
  // anthropic
  return createAnthropic({ apiKey })(model)
}
const handleSdkError = (error: unknown): Response => {
  if (error instanceof APICallError) {
    const status = error.statusCode ?? 502
    let payload: Record<string, unknown>
    if (error.responseBody) {
      try {
        payload = JSON.parse(error.responseBody) as Record<string, unknown>
      } catch {
        payload = { error: error.message }
      }
    } else {
      payload = { error: error.message }
    }
    return Response.json(payload, { status })
  }
  const message = error instanceof Error ? error.message : 'Upstream request failed'
  return jsonError(message, 502)
}

export async function POST(request: Request, context: { params: Params }) {
  const providerRaw = context.params.provider
  if (!isProvider(providerRaw)) {
    return jsonError('Invalid provider', 400)
  }
  let body: RequestBody
  try {
    body = (await request.json()) as RequestBody
  } catch {
    return jsonError('Invalid JSON body', 400)
  }
  if (!body.apiKey) return jsonError('apiKey is required', 400)
  if (!body.model) return jsonError('model is required', 400)
  if (!body.messages || !Array.isArray(body.messages)) return jsonError('messages is required', 400)
  const baseUrl = normalizeBaseUrl(body.baseUrl)
  const providerModel = buildProviderModel(providerRaw, body.apiKey, body.model, baseUrl)
  // Convert messages to AI SDK format
  const sdkMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = body.messages.map(
    (msg: AiMessage) => ({
      role: msg.role,
      content: typeof msg.content === 'string' ? msg.content : msg.content.filter(p => p.type === 'text').map(p => (p as any).text).join(''),
    })
  )
  const callOptions = {
    model: providerModel,
    messages: sdkMessages,
    temperature: typeof body.temperature === 'number' ? body.temperature : undefined,
    maxTokens: typeof body.maxTokens === 'number' ? body.maxTokens : undefined,
  } as const
  if (body.stream) {
    try {
      const result = streamText(callOptions)
      return result.toTextStreamResponse()
    } catch (error) {
      return handleSdkError(error)
    }
  }
  // Non-streaming path
  try {
    const result = await generateText(callOptions)
    return Response.json({ text: result.text }, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    return handleSdkError(error)
  }
}

export const runtime = 'nodejs'
