import { createAnthropicRequest, parseAnthropicResponse } from '@/lib/ai/anthropic'
import { createGeminiRequest, parseGeminiResponse } from '@/lib/ai/gemini'
import { createOpenAIRequest, parseOpenAIResponse } from '@/lib/ai/openai'
import { validateChatResponse } from '@/lib/ai/chat-schemas'
import { interpolatePromptTemplate, loadPromptSettings } from '@/lib/prompt-settings'
import type { AiProvider, AiRequestOptions, AiResponse } from '@/lib/ai/types'

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

const CHAT_RESPONSE_JSON_SCHEMA = {
  oneOf: [
    {
      type: 'object',
      required: ['mode', 'answerText'],
      additionalProperties: false,
      properties: {
        mode: { const: 'answer' },
        answerText: { type: 'string', minLength: 1, maxLength: 5000 },
      },
    },
    {
      type: 'object',
      required: ['mode', 'proposal'],
      additionalProperties: false,
      properties: {
        mode: { const: 'proposal' },
        proposal: {
          type: 'object',
          required: ['title', 'content', 'rationale'],
          additionalProperties: false,
          properties: {
            title: { type: 'string', minLength: 1, maxLength: 200 },
            content: { type: 'string', minLength: 1, maxLength: 10000 },
            rationale: { type: 'string', minLength: 1, maxLength: 1000 },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            diffSummary: { type: 'string', maxLength: 500 },
          },
        },
      },
    },
  ],
} as const

const jsonError = (message: string, status: number, extra?: Record<string, unknown>) =>
  Response.json(extra ? { error: message, ...extra } : { error: message }, { status })

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isProvider = (value: string): value is AiProvider =>
  value === 'gemini' || value === 'openai' || value === 'openai-compatible' || value === 'anthropic'

const normalizeBaseUrl = (value?: string): string | null => {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.replace(/\/+$/, '')
}

const withGeminiKey = (url: string, apiKey: string) => {
  const final = new URL(url)
  final.searchParams.set('key', apiKey)
  return final.toString()
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

const parseOpenAICompatibleResponse = (json: unknown): AiResponse => {
  const parsedOpenAI = parseOpenAIResponse(json)
  if (parsedOpenAI.text.trim()) return parsedOpenAI

  const parsedGemini = parseGeminiResponse(json)
  if (parsedGemini.text.trim()) return parsedGemini

  const parsedAnthropic = parseAnthropicResponse(json)
  if (parsedAnthropic.text.trim()) return parsedAnthropic

  return parsedOpenAI
}

const parseJsonFromModelText = (text: string): unknown => {
  const trimmed = text.trim()
  if (!trimmed) return null

  const candidates: string[] = [trimmed]
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fenced?.[1]) candidates.push(fenced[1].trim())

  const firstBrace = trimmed.indexOf('{')
  const lastBrace = trimmed.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1))
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate)
    } catch {
      continue
    }
  }

  return null
}

const readUpstreamErrorPayload = async (upstream: Response): Promise<unknown> => {
  const contentType = upstream.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    return upstream.json().catch(() => ({ error: 'Upstream error' }))
  }

  const text = await upstream.text().catch(() => '')
  return { error: text || 'Upstream error' }
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

  const options: AiRequestOptions = {
    provider: body.provider,
    model: body.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    temperature: typeof body.temperature === 'number' ? body.temperature : undefined,
    maxTokens: typeof body.maxTokens === 'number' ? body.maxTokens : undefined,
    stream: Boolean(body.stream),
  }

  let url: string
  let reqBody: unknown
  let headers: Record<string, string>

  if (body.provider === 'gemini') {
    const geminiRequest = createGeminiRequest(options)
    url = withGeminiKey(geminiRequest.url, body.apiKey)
    reqBody = geminiRequest.body
    headers = geminiRequest.headers

    if (isRecord(reqBody)) {
      const generationConfig = isRecord(reqBody.generationConfig)
        ? reqBody.generationConfig
        : {}

      reqBody.generationConfig = {
        ...generationConfig,
        responseMimeType: 'application/json',
      }
    }
  } else if (body.provider === 'openai' || body.provider === 'openai-compatible') {
    const openaiRequest = createOpenAIRequest(options)
    const baseUrl = normalizeBaseUrl(body.baseUrl)
    url = baseUrl ? `${baseUrl}/chat/completions` : openaiRequest.url
    reqBody = openaiRequest.body
    headers = {
      ...openaiRequest.headers,
      Authorization: `Bearer ${body.apiKey}`,
    }

    if (isRecord(reqBody)) {
      reqBody.response_format = {
        type: 'json_schema',
        json_schema: {
          name: 'chat_response',
          strict: true,
          schema: CHAT_RESPONSE_JSON_SCHEMA,
        },
      }
    }
  } else {
    const anthropicRequest = createAnthropicRequest(options)
    url = anthropicRequest.url
    reqBody = anthropicRequest.body
    headers = {
      ...anthropicRequest.headers,
      'x-api-key': body.apiKey,
    }
  }

  const upstreamInit: RequestInit = {
    method: 'POST',
    headers,
    body: JSON.stringify(reqBody),
  }

  ;(upstreamInit as RequestInit & { duplex?: 'half' }).duplex = 'half'

  let upstream: Response
  try {
    upstream = await fetch(url, upstreamInit)
  } catch {
    return jsonError('Upstream request failed', 502)
  }

  if (!upstream.ok) {
    const errorPayload = await readUpstreamErrorPayload(upstream)
    if (isRecord(errorPayload)) {
      return Response.json(errorPayload, { status: upstream.status })
    }
    return jsonError('Upstream error', upstream.status)
  }

  if (options.stream) {
    const contentType = upstream.headers.get('content-type') ?? 'text/event-stream; charset=utf-8'

    return new Response(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    })
  }

  const upstreamJson = await upstream.json().catch(() => null)

  const parsedProviderResponse =
    body.provider === 'gemini'
      ? parseGeminiResponse(upstreamJson)
      : body.provider === 'openai'
        ? parseOpenAIResponse(upstreamJson)
        : body.provider === 'openai-compatible'
          ? parseOpenAICompatibleResponse(upstreamJson)
          : parseAnthropicResponse(upstreamJson)

  const parsedJson = parseJsonFromModelText(parsedProviderResponse.text)
  if (!parsedJson) {
    return jsonError('AI response is not valid JSON', 422)
  }

  const validated = validateChatResponse(parsedJson)
  if (!validated.success) {
    return jsonError(validated.error?.message || 'Invalid chat response', 422, {
      issues: validated.error?.issues || [],
    })
  }

  return Response.json(validated.data, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store',
    },
  })
}
