import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '헬스 쇼츠',
  description: '운동 이름으로 쇼츠를 찾아 바로 재생하세요',
}

export const viewport: Viewport = {
  themeColor: '#0B0D10',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-dvh bg-bg text-text antialiased">{children}</body>
    </html>
  )
}
