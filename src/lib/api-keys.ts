const OPENAI_KEY_STORAGE = 'stemflow:apikey:openai'
const ANTHROPIC_KEY_STORAGE = 'stemflow:apikey:anthropic'
const OPENAI_BASEURL_STORAGE = 'stemflow:baseurl:openai'
const ANTHROPIC_BASEURL_STORAGE = 'stemflow:baseurl:anthropic'
const OPENAI_MODEL_STORAGE = 'stemflow:model:openai'
const ANTHROPIC_MODEL_STORAGE = 'stemflow:model:anthropic'
const PROVIDER_STORAGE = 'stemflow:provider'

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

export type ApiProvider = 'openai' | 'anthropic' | 'openai-compatible'

export interface ApiKeyState {
  provider: ApiProvider | null
  openaiKey: string | null
  anthropicKey: string | null
  openaiBaseUrl: string | null
  anthropicBaseUrl: string | null
  openaiModel: string | null
  anthropicModel: string | null
}

export const STORAGE_KEYS = {
  openai: OPENAI_KEY_STORAGE,
  anthropic: ANTHROPIC_KEY_STORAGE,
  openaiBaseUrl: OPENAI_BASEURL_STORAGE,
  anthropicBaseUrl: ANTHROPIC_BASEURL_STORAGE,
  openaiModel: OPENAI_MODEL_STORAGE,
  anthropicModel: ANTHROPIC_MODEL_STORAGE,
  provider: PROVIDER_STORAGE
} as const

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

const toBase64 = (bytes: Uint8Array): string => {
  if (typeof btoa === 'function') {
    let binary = ''
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
  }

  return Buffer.from(bytes).toString('base64')
}

const fromBase64 = (base64: string): Uint8Array => {
  if (typeof atob === 'function') {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes
  }

  return new Uint8Array(Buffer.from(base64, 'base64'))
}

const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
  const { buffer, byteOffset, byteLength } = bytes
  return buffer.slice(byteOffset, byteOffset + byteLength) as ArrayBuffer
}

const getCrypto = (): Crypto | null => {
  if (typeof globalThis === 'undefined') return null
  return globalThis.crypto ?? null
}

const deriveKeySeed = (): string | null => {
  if (typeof window === 'undefined') return null
  if (!window.navigator?.userAgent || !window.location?.origin) return null

  return `${window.navigator.userAgent}${window.location.origin}`
}

const deriveAesKey = async (): Promise<CryptoKey | null> => {
  const seed = deriveKeySeed()
  const crypto = getCrypto()

  if (!seed || !crypto?.subtle) {
    return null
  }

  try {
    const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(seed))
    return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, [
      'encrypt',
      'decrypt'
    ])
  } catch {
    return null
  }
}

const encryptString = async (value: string, key: CryptoKey | null): Promise<string> => {
  if (!key) {
    // Fallback: store as base64 when encryption unavailable
    return `plain:${btoa(value)}`
  }

  const crypto = getCrypto()
  if (!crypto) return `plain:${btoa(value)}`

  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    textEncoder.encode(value)
  )

  return `${toBase64(iv)}:${toBase64(new Uint8Array(encrypted))}`
}

const decryptString = async (
  payload: string,
  key: CryptoKey | null
): Promise<string | null> => {
  // Handle plaintext fallback
  if (payload.startsWith('plain:')) {
    try {
      return atob(payload.slice(6))
    } catch {
      return null
    }
  }

  if (!key) return null

  const [ivPart, dataPart] = payload.split(':')
  if (!ivPart || !dataPart) return null

  const crypto = getCrypto()
  if (!crypto) return null

  try {
    const iv = toArrayBuffer(fromBase64(ivPart))
    const data = toArrayBuffer(fromBase64(dataPart))

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    )

    return textDecoder.decode(decrypted)
  } catch {
    return null
  }
}

export const saveApiKeys = async (state: ApiKeyState): Promise<{ success: boolean; error?: string }> => {
  const storage = getStorage()
  if (!storage) {
    return { success: false, error: 'Browser storage unavailable' }
  }

  try {
    const key = await deriveAesKey()

    if (state.openaiKey) {
      storage.setItem(
        OPENAI_KEY_STORAGE,
        await encryptString(state.openaiKey, key)
      )
    } else {
      storage.removeItem(OPENAI_KEY_STORAGE)
    }

    if (state.anthropicKey) {
      storage.setItem(
        ANTHROPIC_KEY_STORAGE,
        await encryptString(state.anthropicKey, key)
      )
    } else {
      storage.removeItem(ANTHROPIC_KEY_STORAGE)
    }

    if (state.provider) {
      storage.setItem(PROVIDER_STORAGE, state.provider)
    } else {
      storage.removeItem(PROVIDER_STORAGE)
    }

    // Base URLs are stored unencrypted (not sensitive)
    if (state.openaiBaseUrl) {
      storage.setItem(OPENAI_BASEURL_STORAGE, state.openaiBaseUrl)
    } else {
      storage.removeItem(OPENAI_BASEURL_STORAGE)
    }

    if (state.anthropicBaseUrl) {
      storage.setItem(ANTHROPIC_BASEURL_STORAGE, state.anthropicBaseUrl)
    } else {
      storage.removeItem(ANTHROPIC_BASEURL_STORAGE)
    }

    if (state.openaiModel) {
      storage.setItem(OPENAI_MODEL_STORAGE, state.openaiModel)
    } else {
      storage.removeItem(OPENAI_MODEL_STORAGE)
    }

    if (state.anthropicModel) {
      storage.setItem(ANTHROPIC_MODEL_STORAGE, state.anthropicModel)
    } else {
      storage.removeItem(ANTHROPIC_MODEL_STORAGE)
    }

    return { success: true }
  } catch (error) {
    console.error('saveApiKeys error:', error)

    const name =
      error && typeof error === 'object' && 'name' in error
        ? String((error as any).name)
        : undefined

    const message =
      error && typeof error === 'object' && 'message' in error
        ? String((error as any).message)
        : error instanceof Error
          ? error.message
          : typeof error === 'string'
            ? error
            : ''

    if (name === 'QuotaExceededError') {
      return { success: false, error: 'Storage quota exceeded' }
    }

    if (message) {
      return { success: false, error: `Failed to save: ${name ? `${name}: ` : ''}${message}` }
    }

    return { success: false, error: `Failed to save${name ? `: ${name}` : ''}` }
  }
}

export const loadApiKeys = async (): Promise<ApiKeyState> => {
  const storage = getStorage()
  if (!storage) {
    return { provider: null, openaiKey: null, anthropicKey: null, openaiBaseUrl: null, anthropicBaseUrl: null, openaiModel: null, anthropicModel: null }
  }

  try {
    const key = await deriveAesKey()
    const providerValue = storage.getItem(PROVIDER_STORAGE)
    const openaiCipher = storage.getItem(OPENAI_KEY_STORAGE)
    const anthropicCipher = storage.getItem(ANTHROPIC_KEY_STORAGE)
    const openaiBaseUrl = storage.getItem(OPENAI_BASEURL_STORAGE)
    const anthropicBaseUrl = storage.getItem(ANTHROPIC_BASEURL_STORAGE)
    const openaiModel = storage.getItem(OPENAI_MODEL_STORAGE)
    const anthropicModel = storage.getItem(ANTHROPIC_MODEL_STORAGE)

    const [openaiKey, anthropicKey] = await Promise.all([
      openaiCipher ? decryptString(openaiCipher, key) : Promise.resolve(null),
      anthropicCipher
        ? decryptString(anthropicCipher, key)
        : Promise.resolve(null)
    ])

    const provider =
      providerValue === 'openai' || providerValue === 'anthropic' || providerValue === 'openai-compatible'
        ? providerValue
        : null

    return { provider, openaiKey, anthropicKey, openaiBaseUrl, anthropicBaseUrl, openaiModel, anthropicModel }
  } catch {
    return { provider: null, openaiKey: null, anthropicKey: null, openaiBaseUrl: null, anthropicBaseUrl: null, openaiModel: null, anthropicModel: null }
  }
}
