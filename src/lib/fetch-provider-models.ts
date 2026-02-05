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

const fetchOpenAIModels = async (
  apiKey: string,
  baseUrl?: string
): Promise<FetchModelsResult> => {
  const url = `${baseUrl || 'https://api.openai.com/v1'}/models`

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      if (response.status === 401) {
        return { success: false, error: 'Invalid API key' }
      }
      if (response.status === 403) {
        return { success: false, error: 'Access forbidden' }
      }
      return { success: false, error: `HTTP ${response.status}: ${response.statusText}` }
    }

    const data = await response.json()

    if (!data.data || !Array.isArray(data.data)) {
      return { success: false, error: 'Invalid response format' }
    }

    const models: ProviderModel[] = data.data.map((model: any) => ({
      id: model.id,
      name: model.id,
      created: model.created,
      owned_by: model.owned_by
    }))

    return { success: true, models }
  } catch (error) {
    if (error instanceof TypeError) {
      return { success: false, error: 'Network error: Check your connection' }
    }
    if (error instanceof Error) {
      return { success: false, error: error.message }
    }
    return { success: false, error: 'Failed to fetch models' }
  }
}

const fetchAnthropicModels = async (
  apiKey: string,
  baseUrl?: string
): Promise<FetchModelsResult> => {
  const url = `${baseUrl || 'https://api.anthropic.com/v1'}/models`

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      if (response.status === 401) {
        return { success: false, error: 'Invalid API key' }
      }
      if (response.status === 403) {
        return { success: false, error: 'Access forbidden' }
      }
      if (response.status === 404) {
        return { success: false, error: 'Models endpoint not supported by Anthropic' }
      }
      return { success: false, error: `HTTP ${response.status}: ${response.statusText}` }
    }

    const data = await response.json()

    if (!data.data || !Array.isArray(data.data)) {
      return { success: false, error: 'Invalid response format' }
    }

    const models: ProviderModel[] = data.data.map((model: any) => ({
      id: model.id,
      name: model.display_name || model.id,
      created: model.created_at
    }))

    return { success: true, models }
  } catch (error) {
    if (error instanceof TypeError) {
      return { success: false, error: 'Network error: Check your connection' }
    }
    if (error instanceof Error) {
      return { success: false, error: error.message }
    }
    return { success: false, error: 'Failed to fetch models' }
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
