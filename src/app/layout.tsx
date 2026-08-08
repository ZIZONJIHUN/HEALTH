import type { Metadata, Viewport } from 'next'
import { GeistMono } from 'geist/font/mono'
import './globals.css'

/**
 * Pretendard 는 unicode-range 로 92조각 나뉘어 있어 브라우저가 필요한 조각만 받는다.
 * 그중 91번(기본 라틴 + 최빈 한글)과 90번(차빈 한글)은 어떤 화면에서든 반드시 쓰이므로
 * CSS 파싱을 기다리지 않고 미리 받게 한다. 나머지 90조각은 필요할 때만 내려간다.
 */
const PRELOADED_FONT_SUBSETS = [91, 90]

export const metadata: Metadata = {
  title: {
    default: '헬스 쇼츠',
    template: '%s · 헬스 쇼츠',
  },
  description: '운동 이름으로 쇼츠를 찾아 바로 재생하세요',
  applicationName: '헬스 쇼츠',
  openGraph: {
    title: '헬스 쇼츠',
    description: '운동 이름으로 쇼츠를 찾아 바로 재생하세요',
    locale: 'ko_KR',
    type: 'website',
  },
  appleWebApp: {
    capable: true,
    title: '헬스 쇼츠',
    statusBarStyle: 'black-translucent',
  },
  formatDetection: { telephone: false },
}

export const viewport: Viewport = {
  themeColor: '#0a0c0f',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={GeistMono.variable}>
      <head>
        {PRELOADED_FONT_SUBSETS.map((index) => (
          <link
            key={index}
            rel="preload"
            as="font"
            type="font/woff2"
            href={`/fonts/pretendard/PretendardVariable.subset.${index}.woff2`}
            crossOrigin="anonymous"
          />
        ))}
      </head>
      <body className="min-h-dvh bg-bg text-text antialiased">
        <a
          href="#main"
          className="skip-link rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-fg"
        >
          본문 바로가기
        </a>
        {children}
      </body>
    </html>
  )
}
