import type { Metadata } from 'next'

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
      <body style={{ margin: 0, padding: 0, height: '100vh', width: '100vw', fontFamily: 'system-ui, sans-serif' }}>
        {children}
      </body>
    </html>
  )
}
