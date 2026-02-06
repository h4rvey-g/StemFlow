import { createAnthropicRequest, parseAnthropicResponse } from '@/lib/ai/anthropic'
import { createGeminiRequest, GEMINI_API_URL, parseGeminiResponse } from '@/lib/ai/gemini'
import { createOpenAIRequest, parseOpenAIResponse } from '@/lib/ai/openai'
import type { AiProvider, AiRequestOptions, AiResponse } from '@/lib/ai/types'

export const dynamic = 'force-dynamic'

type Params = { provider: string }

type RequestBody = {
  apiKey?: string
  model?: AiRequestOptions['model']
  messages?: AiRequestOptions['messages']
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

const withGeminiKey = (url: string, apiKey: string) => {
  const final = new URL(url)
  final.searchParams.set('key', apiKey)
  return final.toString()
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

  const options: AiRequestOptions = {
    provider: providerRaw,
    model: body.model,
    messages: body.messages,
    temperature: body.temperature,
    maxTokens: body.maxTokens,
    stream: Boolean(body.stream),
  }

  const apiKey = body.apiKey

  const upstreamInit: RequestInit = {
    method: 'POST',
    headers: {},
  }

  let url: string
  let reqBody: unknown
  let headers: Record<string, string>

  if (providerRaw === 'gemini') {
    const gem = createGeminiRequest(options)
    url = withGeminiKey(gem.url, apiKey)
    reqBody = gem.body
    headers = gem.headers
  } else if (providerRaw === 'openai' || providerRaw === 'openai-compatible') {
    const openai = createOpenAIRequest(options)
    const baseUrl = normalizeBaseUrl(body.baseUrl)
    url = baseUrl ? `${baseUrl}/chat/completions` : openai.url
    reqBody = openai.body
    headers = {
      ...openai.headers,
      Authorization: `Bearer ${apiKey}`,
    }
  } else {
    const anthropic = createAnthropicRequest(options)
    url = anthropic.url
    reqBody = anthropic.body
    headers = {
      ...anthropic.headers,
      'x-api-key': apiKey,
    }
  }

  upstreamInit.headers = headers
  upstreamInit.body = JSON.stringify(reqBody)

  // Required by Node's fetch implementation when streaming bodies.
  ;(upstreamInit as any).duplex = 'half'

  let upstream: Response
  try {
    upstream = await fetch(url, upstreamInit)
  } catch {
    return jsonError('Upstream request failed', 502)
  }

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => '')
    return jsonError(text || 'Upstream error', upstream.status)
  }

  if (!options.stream) {
    const json = await upstream.json().catch(() => null)

    let parsed: AiResponse
    if (providerRaw === 'gemini') parsed = parseGeminiResponse(json)
    else if (providerRaw === 'openai' || providerRaw === 'openai-compatible') parsed = parseOpenAIResponse(json)
    else parsed = parseAnthropicResponse(json)

    return Response.json(parsed, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
      },
    })
  }

  // Stream: pass through provider SSE to client.
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

export const runtime = 'nodejs'

// For tests: ensure GEMINI_API_URL is referenced so it stays in-bundle.
void GEMINI_API_URL
