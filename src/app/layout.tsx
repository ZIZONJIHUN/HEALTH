import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import './globals.css'

/**
 * Geist Mono 를 `geist/font/mono` 대신 직접 선언한다.
 *
 * 그 패키지는 `preload` 를 켠 채로 내보낸다. 그래서 이 폰트를 한 글자도 쓰지 않는
 * 첫 화면에서도 <link rel="preload"> 가 붙어 72KB 를 받았다 — 설계 문서가
 * "`.tabular` 가 렌더되는 화면에서만 내려가고 첫 화면에서는 preload 되지 않는다"고
 * 적어 둔 것과 실제 동작이 달랐다(측정으로 확인). 패키지가 옵션을 열어 주지 않아
 * 같은 파일을 가리키는 선언을 여기에 둔다.
 *
 * preload 를 끄면 브라우저는 실제로 `.tabular` 로 그려지는 글자가 생길 때만 받는다.
 * fallback 목록은 패키지 원본과 같게 유지한다 — 폰트가 도착하기 전 잠깐 보이는
 * 글꼴이라 폭 차이가 크면 숫자가 튄다.
 */
const geistMono = localFont({
  src: '../../node_modules/geist/dist/fonts/geist-mono/GeistMono-Variable.woff2',
  variable: '--font-geist-mono',
  weight: '100 900',
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
  fallback: [
    'ui-monospace',
    'SFMono-Regular',
    'Roboto Mono',
    'Menlo',
    'Monaco',
    'Liberation Mono',
    'DejaVu Sans Mono',
    'Courier New',
    'monospace',
  ],
})

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
    <html lang="ko" className={geistMono.variable}>
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
