'use client'

import { useEffect } from 'react'
import { I18nextProvider } from 'react-i18next'
import i18n, { getStoredLanguage } from '@/lib/i18n'

function syncDocumentLang(lang: string) {
  document.documentElement.lang = lang
}

interface I18nProviderProps {
  children: React.ReactNode
}

export function I18nProvider({ children }: I18nProviderProps) {
  useEffect(() => {
    const preferredLanguage = getStoredLanguage()

    if (preferredLanguage !== i18n.language) {
      void i18n.changeLanguage(preferredLanguage)
    }

    syncDocumentLang(i18n.language)

    const handleLanguageChanged = (lng: string) => {
      syncDocumentLang(lng)
    }

    i18n.on('languageChanged', handleLanguageChanged)

    return () => {
      i18n.off('languageChanged', handleLanguageChanged)
    }
  }, [])

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
}
