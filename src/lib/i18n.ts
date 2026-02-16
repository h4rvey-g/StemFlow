import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import enTranslations from '@/locales/en.json'
import zhCNTranslations from '@/locales/zh-CN.json'

const LANGUAGE_STORAGE_KEY = 'stemflow:language'
const SUPPORTED_LANGUAGES = ['en', 'zh-CN'] as const

type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number]

const getStorage = (): Storage | null => {
  if (typeof window === 'undefined') return null

  try {
    const { localStorage } = window
    if (!localStorage) return null

    const testKey = '__stemflow_i18n_test__'
    localStorage.setItem(testKey, '1')
    localStorage.removeItem(testKey)

    return localStorage
  } catch {
    return null
  }
}

const getStoredLanguage = (): SupportedLanguage => {
  const storage = getStorage()
  if (!storage) return 'en'

  try {
    const stored = storage.getItem(LANGUAGE_STORAGE_KEY)
    if (stored && SUPPORTED_LANGUAGES.includes(stored as SupportedLanguage)) {
      return stored as SupportedLanguage
    }
  } catch {
    return 'en'
  }

  return 'en'
}

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        translation: enTranslations
      },
      'zh-CN': {
        translation: zhCNTranslations
      }
    },
    lng: getStoredLanguage(),
    fallbackLng: 'en',
    initImmediate: false,
    interpolation: {
      escapeValue: false
    }
  })

export default i18n
export { LANGUAGE_STORAGE_KEY, SUPPORTED_LANGUAGES }
export type { SupportedLanguage }
