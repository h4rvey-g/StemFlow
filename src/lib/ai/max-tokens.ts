import modelsSchema from '@/lib/models-schema.json'

interface ModelLimit {
  output?: unknown
}

interface ModelDescriptor {
  limit?: ModelLimit
}

interface ProviderDescriptor {
  models?: Record<string, ModelDescriptor>
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const toFinitePositiveNumber = (value: unknown): number | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return undefined
  }

  return value
}

export const getModelOutputTokenLimit = (modelId: string): number | undefined => {
  if (!modelId.trim()) {
    return undefined
  }

  for (const providerValue of Object.values(modelsSchema as Record<string, unknown>)) {
    if (!isRecord(providerValue)) continue

    const provider = providerValue as ProviderDescriptor
    const models = provider.models
    if (!models || !isRecord(models) || !(modelId in models)) continue

    const model = models[modelId]
    return toFinitePositiveNumber(model?.limit?.output)
  }

  return undefined
}
