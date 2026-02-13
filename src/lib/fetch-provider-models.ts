import type { ApiProvider } from './api-keys'

export interface ProviderModel {
  id: string
  name?: string
  created?: number
  owned_by?: string
  context_window?: number
}

export interface FetchModelsResult {
  success: boolean
  models?: ProviderModel[]
  error?: string
}

interface FetchModelsApiResponse {
  models?: ProviderModel[]
  error?: string
}

const fetchOpenAIModels = async (
  apiKey: string,
  baseUrl?: string
): Promise<FetchModelsResult> => {
  const response = await fetch('/api/models/openai', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ apiKey, baseUrl })
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as FetchModelsApiResponse | null
    return { success: false, error: payload?.error || `HTTP ${response.status}: ${response.statusText}` }
  }

  const payload = (await response.json().catch(() => null)) as FetchModelsApiResponse | null

  return {
    success: true,
    models: payload?.models ?? []
  }
}

const fetchAnthropicModels = async (
  apiKey: string,
  baseUrl?: string
): Promise<FetchModelsResult> => {
  const response = await fetch('/api/models/anthropic', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ apiKey, baseUrl })
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as FetchModelsApiResponse | null
    return { success: false, error: payload?.error || `HTTP ${response.status}: ${response.statusText}` }
  }

  const payload = (await response.json().catch(() => null)) as FetchModelsApiResponse | null

  return {
    success: true,
    models: payload?.models ?? []
  }
}

export const fetchProviderModels = async (
  provider: ApiProvider,
  apiKey: string,
  baseUrl?: string
): Promise<FetchModelsResult> => {
  if (!apiKey) {
    return { success: false, error: 'API key is required' }
  }

  if (provider === 'openai' || provider === 'openai-compatible') {
    return fetchOpenAIModels(apiKey, baseUrl)
  }

  if (provider === 'anthropic') {
    return fetchAnthropicModels(apiKey, baseUrl)
  }

  return { success: false, error: 'Unknown provider' }
}
