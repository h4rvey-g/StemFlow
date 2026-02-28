import { APICallError, generateObject, streamObject } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { chatResponseSchema } from '@/lib/ai/chat-schemas'
import { interpolatePromptTemplate, loadPromptSettings } from '@/lib/prompt-settings'
import type { AiProvider } from '@/lib/ai/types'
import type { LanguageModel } from 'ai'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type RequestBody = {
  provider?: AiProvider
  apiKey?: string
  model?: string
  baseUrl?: string
  temperature?: number
  maxTokens?: number
  stream?: boolean
  nodeId?: string
  nodeType?: string
  message?: string
  nodeContent?: string
  ancestry?: string | string[]
  chatSystemPrompt?: string
  chatUserMessageTemplate?: string
}

const jsonError = (message: string, status: number, extra?: Record<string, unknown>) =>
  Response.json(extra ? { error: message, ...extra } : { error: message }, { status })

const isProvider = (value: string): value is AiProvider =>
  value === 'gemini' || value === 'openai' || value === 'openai-compatible' || value === 'anthropic'

const normalizeBaseUrl = (value?: string): string | null => {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.replace(/\/+$/, '')
}

const normalizeAncestry = (ancestry: RequestBody['ancestry']): string | null => {
  if (typeof ancestry === 'string') {
    return ancestry
  }

  if (Array.isArray(ancestry)) {
    return ancestry.filter((item): item is string => typeof item === 'string').join('\n')
  }

  return null
}


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

export async function POST(request: Request) {
  let body: RequestBody
  try {
    body = (await request.json()) as RequestBody
  } catch {
    return jsonError('Invalid JSON body', 400)
  }

  if (!body.provider || !isProvider(body.provider)) return jsonError('provider is required', 400)
  if (!body.apiKey) return jsonError('apiKey is required', 400)
  if (!body.model) return jsonError('model is required', 400)
  if (!body.nodeId || !body.nodeId.trim()) return jsonError('nodeId is required', 400)
  if (!body.message || !body.message.trim()) return jsonError('message is required', 400)
  if (!body.nodeContent || !body.nodeContent.trim()) return jsonError('nodeContent is required', 400)

  const ancestry = normalizeAncestry(body.ancestry)
  if (ancestry === null) return jsonError('ancestry is required', 400)

  const promptSettings = loadPromptSettings()
  const systemPrompt = (body.chatSystemPrompt || promptSettings.chatSystemPrompt).trim()
  const userTemplate =
    (body.chatUserMessageTemplate || promptSettings.chatUserMessageTemplate).trim()

  const userMessage = interpolatePromptTemplate(userTemplate, {
    nodeId: body.nodeId.trim(),
    nodeType: body.nodeType?.trim() || 'UNKNOWN',
    nodeContent: body.nodeContent.trim(),
    ancestry,
    message: body.message.trim(),
  })

  const baseUrl = normalizeBaseUrl(body.baseUrl)
  const providerModel = buildProviderModel(body.provider, body.apiKey, body.model, baseUrl)

  const sdkMessages: Array<{ role: 'system' | 'user'; content: string }> = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ]

  const callOptions = {
    model: providerModel,
    messages: sdkMessages,
    temperature: typeof body.temperature === 'number' ? body.temperature : undefined,
    maxTokens: typeof body.maxTokens === 'number' ? body.maxTokens : undefined,
  } as const

  if (body.stream) {
    try {
      const result = streamObject({
        ...callOptions,
        schema: chatResponseSchema,
        output: 'object',
      })
      return result.toTextStreamResponse()
    } catch (error) {
      return handleSdkError(error)
    }
  }

  // Non-streaming path: generate full object with schema validation
  let resultData: unknown
  try {
    const result = await generateObject({
      ...callOptions,
      schema: chatResponseSchema,
      output: 'object',
    })
    resultData = result.object
  } catch (error) {
    return handleSdkError(error)
  }

  // Data is already validated by AI SDK schema enforcement
  if (!resultData) {
    return jsonError('AI response is empty', 422)
  }

  return Response.json(resultData, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store',
    },
  })
}
