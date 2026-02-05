import type { ModelsDevSnapshot, ModelEntry, Provider } from '@/types/models-dev'

const MODELS_DEV_API_URL = 'https://models.dev/api.json'
const CACHE_KEY = 'stemflow:models-dev:cache'
const CACHE_TIMESTAMP_KEY = 'stemflow:models-dev:timestamp'
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000

export interface FlatModel {
  providerId: string
  providerName: string
  modelId: string
  model: ModelEntry
}

const getStorage = (): Storage | null => {
  if (typeof window === 'undefined') return null

  try {
    const { localStorage } = window
    if (!localStorage) return null

    const testKey = '__stemflow_storage_test__'
    localStorage.setItem(testKey, '1')
    localStorage.removeItem(testKey)

    return localStorage
  } catch {
    return null
  }
}

const getCachedData = (): ModelsDevSnapshot | null => {
  const storage = getStorage()
  if (!storage) return null

  try {
    const cached = storage.getItem(CACHE_KEY)
    const timestamp = storage.getItem(CACHE_TIMESTAMP_KEY)

    if (!cached || !timestamp) return null

    const age = Date.now() - parseInt(timestamp, 10)
    if (age > CACHE_DURATION_MS) {
      storage.removeItem(CACHE_KEY)
      storage.removeItem(CACHE_TIMESTAMP_KEY)
      return null
    }

    return JSON.parse(cached) as ModelsDevSnapshot
  } catch {
    return null
  }
}

const setCachedData = (data: ModelsDevSnapshot): void => {
  const storage = getStorage()
  if (!storage) return

  try {
    storage.setItem(CACHE_KEY, JSON.stringify(data))
    storage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString())
  } catch (error) {
    console.error('Failed to cache models data:', error)
  }
}

export const fetchModelsDevData = async (): Promise<ModelsDevSnapshot> => {
  const cached = getCachedData()
  if (cached) return cached

  try {
    const response = await fetch(MODELS_DEV_API_URL)

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const data = (await response.json()) as ModelsDevSnapshot

    setCachedData(data)

    return data
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error('Network error: Check your connection')
    }
    if (error instanceof Error) {
      throw new Error(`Failed to fetch models: ${error.message}`)
    }
    throw new Error('Failed to fetch models')
  }
}

export const getProviderModels = (
  snapshot: ModelsDevSnapshot,
  providerId: string
): FlatModel[] => {
  const provider = snapshot[providerId]
  if (!provider || !provider.models) return []

  return Object.entries(provider.models).map(([modelId, model]) => ({
    providerId,
    providerName: provider.name || providerId,
    modelId,
    model
  }))
}

export const getAllModels = (snapshot: ModelsDevSnapshot): FlatModel[] => {
  const models: FlatModel[] = []

  for (const [providerId, provider] of Object.entries(snapshot)) {
    if (!provider.models) continue

    for (const [modelId, model] of Object.entries(provider.models)) {
      models.push({
        providerId,
        providerName: provider.name || providerId,
        modelId,
        model
      })
    }
  }

  return models
}

export const findModelById = (
  snapshot: ModelsDevSnapshot,
  modelId: string
): FlatModel | null => {
  for (const [providerId, provider] of Object.entries(snapshot)) {
    if (!provider.models) continue

    const model = provider.models[modelId]
    if (model) {
      return {
        providerId,
        providerName: provider.name || providerId,
        modelId,
        model
      }
    }
  }

  return null
}

export const getProviderById = (
  snapshot: ModelsDevSnapshot,
  providerId: string
): Provider | null => {
  return snapshot[providerId] || null
}
