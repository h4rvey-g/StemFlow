import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { provider: string }

type RequestBody = {
  apiKey?: string
  baseUrl?: string
}

interface ProviderModel {
  id: string
  name?: string
  created?: number
  owned_by?: string
  context_window?: number
}

type ModelsResponse = {
  models: ProviderModel[]
}

const normalizeBaseUrl = (value?: string): string | null => {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.replace(/\/+$/, '')
}

const getString = (value: unknown): string | null => {
  return typeof value === 'string' && value.trim() ? value : null
}

const getNumber = (value: unknown): number | undefined => {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

const parseOpenAIModels = (payload: unknown): ProviderModel[] => {
  if (!payload || typeof payload !== 'object' || !('data' in payload)) return []
  const data = payload.data
  if (!Array.isArray(data)) return []

  const models: ProviderModel[] = []

  for (const item of data) {
      if (!item || typeof item !== 'object') continue

      const id = getString('id' in item ? item.id : undefined)
      if (!id) continue

      const created = getNumber('created' in item ? item.created : undefined)
      const ownedBy = getString('owned_by' in item ? item.owned_by : undefined)

      models.push({
        id,
        name: id,
        created,
        owned_by: ownedBy ?? undefined,
      })
  }

  return models
}

const parseAnthropicModels = (payload: unknown): ProviderModel[] => {
  if (!payload || typeof payload !== 'object' || !('data' in payload)) return []
  const data = payload.data
  if (!Array.isArray(data)) return []

  const models: ProviderModel[] = []

  for (const item of data) {
      if (!item || typeof item !== 'object') continue

      const id = getString('id' in item ? item.id : undefined)
      if (!id) continue

      const displayName = getString('display_name' in item ? item.display_name : undefined)
      const createdAt = getNumber('created_at' in item ? item.created_at : undefined)

      models.push({
        id,
        name: displayName ?? id,
        created: createdAt,
      })
  }

  return models
}

const jsonError = (message: string, status: number) => NextResponse.json({ error: message }, { status })

const buildUpstream = (provider: string, body: RequestBody): { url: string; headers: HeadersInit } | null => {
  const { apiKey } = body
  if (!apiKey) return null

  if (provider === 'openai' || provider === 'openai-compatible') {
    const base = normalizeBaseUrl(body.baseUrl) || 'https://api.openai.com/v1'
    return {
      url: `${base}/models`,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    }
  }

  if (provider === 'anthropic') {
    const base = normalizeBaseUrl(body.baseUrl) || 'https://api.anthropic.com/v1'
    return {
      url: `${base}/models`,
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
    }
  }

  return null
}

export async function POST(request: Request, context: { params: Params }) {
  const provider = context.params.provider

  if (provider !== 'openai' && provider !== 'openai-compatible' && provider !== 'anthropic') {
    return jsonError('Unsupported provider', 400)
  }

  let body: RequestBody
  try {
    body = (await request.json()) as RequestBody
  } catch {
    return jsonError('Invalid JSON body', 400)
  }

  if (!body.apiKey) {
    return jsonError('apiKey is required', 400)
  }

  const upstream = buildUpstream(provider, body)
  if (!upstream) {
    return jsonError('Invalid provider configuration', 400)
  }

  try {
    const response = await fetch(upstream.url, {
      method: 'GET',
      headers: upstream.headers,
      cache: 'no-store',
    })

    if (!response.ok) {
      if (response.status === 401) {
        return jsonError('Invalid API key', 401)
      }
      if (response.status === 403) {
        return jsonError('Access forbidden', 403)
      }
      if (provider === 'anthropic' && response.status === 404) {
        return jsonError('Models endpoint not supported by Anthropic', 404)
      }

      return jsonError(`HTTP ${response.status}: ${response.statusText}`, response.status)
    }

    const payload = await response.json().catch(() => null)
    const models = provider === 'anthropic' ? parseAnthropicModels(payload) : parseOpenAIModels(payload)

    const result: ModelsResponse = { models }

    return NextResponse.json(result, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
      },
    })
  } catch {
    return jsonError('Network error: Check your connection', 502)
  }
}
