'use client'

import { ThemeProvider as NextThemesProvider } from 'next-themes'

interface ThemeProviderProps {
  children: React.ReactNode
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      themes={['bright', 'dark']}
      value={{ bright: 'light', dark: 'dark' }}
      defaultTheme="bright"
      enableSystem={false}
      storageKey="stemflow:theme"
    >
      {children}
    </NextThemesProvider>
  )
}
