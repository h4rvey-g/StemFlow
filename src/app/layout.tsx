import type { Metadata } from 'next'
import localFont from 'next/font/local'
import { I18nProvider } from '@/components/providers/I18nProvider'
import { ThemeProvider } from '@/components/providers/ThemeProvider'
import './globals.css'

const inter = localFont({
  src: [
    {
      path: '../../public/fonts/inter/inter-latin-400-normal.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../../public/fonts/inter/inter-latin-500-normal.woff2',
      weight: '500',
      style: 'normal',
    },
    {
      path: '../../public/fonts/inter/inter-latin-600-normal.woff2',
      weight: '600',
      style: 'normal',
    },
    {
      path: '../../public/fonts/inter/inter-latin-700-normal.woff2',
      weight: '700',
      style: 'normal',
    },
  ],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'StemFlow',
  description: 'AI-assisted canvas for scientific research',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={inter.variable}
    >
      <body className="m-0 h-screen w-screen bg-slate-100 font-sans text-slate-900 antialiased transition-colors dark:bg-slate-950 dark:text-slate-100">
        <ThemeProvider>
          <I18nProvider>{children}</I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
