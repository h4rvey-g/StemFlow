import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  loadApiKeys,
  saveApiKeys,
  STORAGE_KEYS
} from '@/lib/api-keys'

const createLocalStorage = () => {
  const store = new Map<string, string>()
  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value)
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key)
    })
  }
}

describe('api keys storage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('encrypts and decrypts api keys using Web Crypto', async () => {
    const storage = createLocalStorage()
    Object.defineProperty(window, 'localStorage', {
      value: storage,
      configurable: true
    })

    const state = {
      provider: 'openai' as const,
      openaiKey: 'openai-secret',
      anthropicKey: 'anthropic-secret',
      geminiKey: 'gemini-secret',
      openaiBaseUrl: null,
      anthropicBaseUrl: null,
      openaiModel: null,
      anthropicModel: null,
      geminiModel: null,
    }

    const saved = await saveApiKeys(state)
    expect(saved.success).toBe(true)

    const storedOpenAI = storage.getItem(STORAGE_KEYS.openai)
    const storedAnthropic = storage.getItem(STORAGE_KEYS.anthropic)
    const storedGemini = storage.getItem(STORAGE_KEYS.gemini)
    const storedProvider = storage.getItem(STORAGE_KEYS.provider)

    expect(storedProvider).toBe('openai')
    expect(storedOpenAI).not.toBe(state.openaiKey)
    expect(storedAnthropic).not.toBe(state.anthropicKey)
    expect(storedGemini).not.toBe(state.geminiKey)
    expect(storedOpenAI).toContain(':')
    expect(storedAnthropic).toContain(':')
    expect(storedGemini).toContain(':')

    const loaded = await loadApiKeys()
    expect(loaded).toEqual({
      provider: 'openai',
      openaiKey: 'openai-secret',
      anthropicKey: 'anthropic-secret',
      geminiKey: 'gemini-secret',
      openaiBaseUrl: null,
      anthropicBaseUrl: null,
      openaiModel: null,
      anthropicModel: null,
      geminiModel: null,
    })
  })

  it('clears keys when values are null', async () => {
    const storage = createLocalStorage()
    Object.defineProperty(window, 'localStorage', {
      value: storage,
      configurable: true
    })

    storage.setItem(STORAGE_KEYS.openai, 'placeholder')
    storage.setItem(STORAGE_KEYS.anthropic, 'placeholder')
    storage.setItem(STORAGE_KEYS.provider, 'openai')

    const saved = await saveApiKeys({
      provider: null,
      openaiKey: null,
      anthropicKey: null,
      geminiKey: null,
      openaiBaseUrl: null,
      anthropicBaseUrl: null,
      openaiModel: null,
      anthropicModel: null,
      geminiModel: null,
    })

    expect(saved.success).toBe(true)
    expect(storage.getItem(STORAGE_KEYS.openai)).toBeNull()
    expect(storage.getItem(STORAGE_KEYS.anthropic)).toBeNull()
    expect(storage.getItem(STORAGE_KEYS.gemini)).toBeNull()
    expect(storage.getItem(STORAGE_KEYS.provider)).toBeNull()
  })

  it('returns empty state when storage unavailable', async () => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new Error('blocked')
      },
      configurable: true
    })

    const saved = await saveApiKeys({
      provider: 'anthropic',
      openaiKey: 'openai-secret',
      anthropicKey: 'anthropic-secret',
      geminiKey: 'gemini-secret',
      openaiBaseUrl: null,
      anthropicBaseUrl: null,
      openaiModel: null,
      anthropicModel: null,
      geminiModel: null,
    })

    expect(saved.success).toBe(false)
    await expect(loadApiKeys()).resolves.toEqual({
      provider: null,
      openaiKey: null,
      anthropicKey: null,
      geminiKey: null,
      openaiBaseUrl: null,
      anthropicBaseUrl: null,
      openaiModel: null,
      anthropicModel: null,
      geminiModel: null,
    })
  })
})
