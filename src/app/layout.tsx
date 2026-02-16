import type { Metadata } from 'next'
import { I18nProvider } from '@/components/providers/I18nProvider'
import './globals.css'

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
    <html lang="en" suppressHydrationWarning>
      <body className="m-0 h-screen w-screen bg-slate-100 font-sans text-slate-900 antialiased">
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  )
}
