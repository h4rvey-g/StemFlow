import type { Metadata } from 'next'
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
    <html lang="en">
      <body className="m-0 h-screen w-screen bg-slate-100 font-sans text-slate-900 antialiased">
        {children}
      </body>
    </html>
  )
}
