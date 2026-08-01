# 단계 1: 운동 쇼츠 검색과 재생 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 운동 이름을 검색하면 YouTube 쇼츠 썸네일 그리드가 나오고, 썸네일을 탭하면 전체화면 세로 스와이프 피드에서 연속 재생되는 웹 앱을 배포 가능한 상태로 만든다.

**Architecture:** Next.js App Router의 서버 컴포넌트가 `getVideos(query)`를 직접 호출한다. `getVideos`는 Supabase 캐시를 먼저 확인하고, 없으면 YouTube Data API를 2단계로 호출해(검색 → 길이 확인) 180초 이하만 남긴 뒤 캐시에 저장한다. YouTube API 키는 서버 모듈에서만 읽는다. 순수 로직(길이 파서, 쇼츠 필터, 검색어 정규화, 임베드 URL)은 별도 파일로 분리해 단위 테스트하고, 네트워크가 붙는 계층은 MSW로, 화면 흐름은 Playwright로 검증한다.

**Tech Stack:** Next.js (App Router) 15+, React 19, TypeScript, Tailwind CSS v4, Supabase JS v2, Vitest 3+, MSW 2+, Playwright

## Global Constraints

- 다크 전용. 라이트모드 토글을 만들지 않는다.
- 팔레트 (Tailwind 테마 토큰으로 등록): 배경 `#0B0D10`, 카드 `#14171C`, 카드2 `#1C2027`, 경계 `#262B33`, 본문 `#E8EBF0`, 보조 `#8A929E`, 강조 `#C8FF3D`, 경고 `#FF5A5F`
- `YOUTUBE_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`는 서버 모듈에서만 읽는다. `'use client'` 파일이나 `NEXT_PUBLIC_` 접두사에 절대 넣지 않는다.
- 쇼츠 판정: 실제 길이 **180초 이하**, 그리고 0초 초과 (0초는 라이브 스트림)
- `search.list` 파라미터: `type=video`, `videoDuration=short`, `videoEmbeddable=true`, `regionCode=KR`, `relevanceLanguage=ko`, `maxResults=25`
- iframe 파라미터: `autoplay=1`, `mute=1`, `loop=1`, `playlist=<videoId>`, `playsinline=1`, `rel=0`, `modestbranding=1`
- 캐시 TTL: 7일. 검색어 정규화: 앞뒤 공백 제거 → 소문자화 → 연속 공백 1칸
- 피드 라우트는 `/feed?q=<검색어>&i=<인덱스>`. 탭바를 렌더하지 않는다.
- 피드는 현재 슬라이드와 앞뒤 1개만 iframe을 마운트한다. 나머지는 썸네일.
- 단계 1에서는 탭바에 **운동 탭만** 노출한다.
- 부위별 카테고리는 가슴, 등, 어깨, 하체, 팔, 코어, 전신 7개.
- 캐시 장애는 검색을 실패시키지 않는다. Supabase 환경변수가 없거나 호출이 실패하면 캐시를 조용히 건너뛴다.
- 모든 테스트는 실제 YouTube 쿼터를 소모하지 않는다.
- 설치된 버전은 **Next.js 16.2.11 / React 19.2.4 / Tailwind v4**다. 번들 문서(`node_modules/next/dist/docs/`)로 확인한 사항:
  - `searchParams`는 Promise이므로 `await`한다. Next 16은 동기 접근을 완전히 제거했다.
  - `next.config.ts`에 **`cacheComponents`를 켜지 않는다.** 켜면 동적 API가 `<Suspense>` 밖에서 빌드 오류를 낸다. 이 앱은 Next 캐시가 아닌 자체 Supabase 캐시에 의존한다.
  - `fetch`는 기본적으로 캐시되지 않고 한 렌더 안에서만 중복 제거된다. YouTube 응답에 `cache` 옵션을 붙이지 않는다.
  - `next lint`는 제거됐다. `npm run lint`를 쓴다.
  - `next.config.ts`에 커스텀 `webpack()` 설정을 넣지 않는다. Turbopack이 기본이라 빌드가 실패한다.

---

## 파일 구조

| 파일 | 책임 |
|---|---|
| `src/lib/types.ts` | `ShortVideo`, `VideoSearchResult` 타입 |
| `src/lib/duration.ts` | ISO8601 길이 파싱, `M:SS` 포맷 (순수) |
| `src/lib/shorts.ts` | 쇼츠 길이 필터 (순수) |
| `src/lib/cacheKey.ts` | 검색어 정규화 (순수) |
| `src/lib/embed.ts` | YouTube 임베드 URL 생성 (순수) |
| `src/lib/youtube.ts` | YouTube Data API 2단계 호출, 쿼터 오류 판별 |
| `src/lib/searchCache.ts` | Supabase 캐시 읽기/쓰기, TTL 판정 |
| `src/lib/videoSearch.ts` | 캐시 → API → 캐시 저장 → 쿼터 폴백 오케스트레이션 |
| `src/data/categories.ts` | 부위별 카테고리, 인기 운동 20개 |
| `src/app/layout.tsx` | `html`/`body`, 전역 스타일 |
| `src/app/(tabs)/layout.tsx` | 탭이 있는 화면의 셸 + 하단 탭바 |
| `src/app/(tabs)/page.tsx` | 운동 탭. 검색·카테고리·그리드 |
| `src/app/feed/page.tsx` | 전면 스와이프 피드 (탭바 없음) |
| `src/app/api/videos/route.ts` | `getVideos`의 JSON 래퍼 |
| `src/components/BottomTabBar.tsx` | 하단 탭바 |
| `src/components/SearchBar.tsx` | GET 폼 검색창 |
| `src/components/CategoryChips.tsx` | 부위별 카테고리 칩 |
| `src/components/VideoGrid.tsx` | 썸네일 2열 그리드 + 카드 |
| `src/components/EmptyState.tsx` | 결과 0개 안내 + 추천 검색어 |
| `src/components/QuotaBanner.tsx` | 쿼터 초과 배너 |
| `src/components/ShortsFeed.tsx` | scroll-snap 컨테이너, 마운트 윈도우 관리 |
| `src/components/FeedSlide.tsx` | 슬라이드 1개. iframe 또는 썸네일 |
| `src/components/BackButton.tsx` | `router.back()` 버튼 |
| `supabase/migrations/0001_search_cache.sql` | `search_cache` 테이블 |
| `scripts/seed-cache.ts` | 인기 운동 20개 캐시 시드 |

**서버 전용 모듈:** `youtube.ts`, `searchCache.ts`, `videoSearch.ts`. `'use client'` 파일에서 절대 import하지 않는다.

---

### Task 1: 프로젝트 셋업과 다크 셸

**Files:**
- Create: 프로젝트 전체 (`create-next-app`)
- Create: `src/app/globals.css`
- Create: `src/app/layout.tsx`
- Create: `src/app/(tabs)/layout.tsx`
- Create: `src/app/(tabs)/page.tsx`
- Create: `src/components/BottomTabBar.tsx`
- Create: `vitest.config.ts`
- Create: `.env.local.example`
- Create: `next.config.ts`
- Delete: `create-next-app`이 만든 `src/app/page.tsx` (라우트 그룹으로 이동)

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces: `@/*` → `src/*` 경로 별칭, Tailwind 색 토큰 (`bg-bg`, `bg-surface`, `bg-surface2`, `border-border`, `text-text`, `text-muted`, `text-accent`, `bg-accent`, `text-danger`), `npm test` = Vitest, `next.config.ts`의 `i.ytimg.com` 이미지 허용

- [ ] **Step 1: Next.js 프로젝트 생성**

현재 디렉터리에 이미 `.git`, `docs/`, `.gitignore`가 있으므로 **현재 디렉터리에** 생성한다.

```bash
npx create-next-app@latest . --typescript --tailwind --app --src-dir --eslint --no-turbopack --use-npm
```

프롬프트가 나오면 기존 파일 덮어쓰기를 허용한다. `.gitignore`가 덮어써지면 `node_modules/`, `.next/`, `.env*.local`, `.vercel`이 들어있는지 확인한다.

- [ ] **Step 2: 테스트 도구 설치**

```bash
npm install --save-dev vitest msw @playwright/test tsx
npm install @supabase/supabase-js
npx playwright install chromium
```

- [ ] **Step 3: Vitest 설정 파일 작성**

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
```

`package.json`의 `scripts`에 추가:

```json
"test": "vitest run",
"test:watch": "vitest",
"test:e2e": "playwright test"
```

- [ ] **Step 4: 다크 팔레트를 Tailwind 테마 토큰으로 등록**

`src/app/globals.css` 전체를 교체:

```css
@import "tailwindcss";

@theme {
  --color-bg: #0B0D10;
  --color-surface: #14171C;
  --color-surface2: #1C2027;
  --color-border: #262B33;
  --color-text: #E8EBF0;
  --color-muted: #8A929E;
  --color-accent: #C8FF3D;
  --color-danger: #FF5A5F;
}

html {
  color-scheme: dark;
}
```

- [ ] **Step 5: 이미지 호스트 허용**

`next.config.ts`:

```ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'i.ytimg.com' }],
  },
}

export default nextConfig
```

- [ ] **Step 6: 루트 레이아웃 작성**

`src/app/layout.tsx` 전체를 교체:

```tsx
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
```

- [ ] **Step 7: 하단 탭바 작성**

`src/components/BottomTabBar.tsx`:

```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [{ href: '/', label: '운동' }] as const

export default function BottomTabBar() {
  const pathname = usePathname()

  return (
    <nav aria-label="주요 메뉴" className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface">
      <ul className="mx-auto flex max-w-md">
        {TABS.map((tab) => {
          const active = pathname === tab.href
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={`flex h-16 items-center justify-center text-xs font-medium ${
                  active ? 'text-accent' : 'text-muted'
                }`}
              >
                {tab.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
```

- [ ] **Step 8: 탭 그룹 레이아웃과 임시 홈 작성**

`create-next-app`이 만든 `src/app/page.tsx`를 삭제한다.

```bash
rm src/app/page.tsx
```

`src/app/(tabs)/layout.tsx`:

```tsx
import BottomTabBar from '@/components/BottomTabBar'

export default function TabsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="mx-auto max-w-md px-4 pb-24 pt-6">{children}</div>
      <BottomTabBar />
    </>
  )
}
```

`src/app/(tabs)/page.tsx` (Task 7에서 완성):

```tsx
export default function ExercisePage() {
  return <h1 className="text-xl font-bold">운동</h1>
}
```

- [ ] **Step 9: 환경변수 예시 파일 작성**

`.env.local.example`:

```
# YouTube Data API v3 키. 서버에서만 사용된다.
YOUTUBE_API_KEY=

# 테스트에서 모의 서버를 가리키기 위한 용도. 비워두면 공식 엔드포인트를 쓴다.
YOUTUBE_API_BASE=

# Supabase 검색 캐시. 비워두면 캐시 없이 동작한다.
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

- [ ] **Step 10: 빌드와 테스트가 통과하는지 확인**

```bash
npm run build
npm test
```

기대: 빌드 성공. `npm test`는 테스트 파일이 없어 "No test files found"로 종료된다 (Vitest는 이때 종료 코드 1을 낸다). 다음 태스크에서 첫 테스트가 추가되면 해결되므로 여기서는 빌드 성공만 확인한다.

- [ ] **Step 11: 커밋**

```bash
git add -A
git commit -m "chore: Next.js + Tailwind 다크 셸과 테스트 도구 셋업"
```

---

### Task 2: 영상 길이 파서와 포맷터

**Files:**
- Create: `src/lib/duration.ts`
- Test: `tests/unit/duration.test.ts`

**Interfaces:**
- Consumes: Task 1의 `@/*` 별칭, Vitest
- Produces:
  - `parseIso8601Duration(value: string): number | null` — 초 단위. 형식이 아니면 `null`
  - `formatDuration(totalSeconds: number): string` — `"0:45"`, `"3:00"` 형태

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/unit/duration.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { formatDuration, parseIso8601Duration } from '@/lib/duration'

describe('parseIso8601Duration', () => {
  it('초만 있는 값을 파싱한다', () => {
    expect(parseIso8601Duration('PT45S')).toBe(45)
  })

  it('분과 초를 파싱한다', () => {
    expect(parseIso8601Duration('PT1M30S')).toBe(90)
  })

  it('분만 있는 값을 파싱한다', () => {
    expect(parseIso8601Duration('PT3M')).toBe(180)
  })

  it('시간까지 파싱한다', () => {
    expect(parseIso8601Duration('PT1H2M3S')).toBe(3723)
  })

  it('일 단위를 파싱한다', () => {
    expect(parseIso8601Duration('P1DT2H')).toBe(93600)
  })

  it('0초 라이브 스트림을 0으로 파싱한다', () => {
    expect(parseIso8601Duration('PT0S')).toBe(0)
  })

  it('형식이 아니면 null을 반환한다', () => {
    expect(parseIso8601Duration('')).toBeNull()
    expect(parseIso8601Duration('45')).toBeNull()
    expect(parseIso8601Duration('PT')).toBeNull()
    expect(parseIso8601Duration('P')).toBeNull()
  })
})

describe('formatDuration', () => {
  it('초를 두 자리로 채운다', () => {
    expect(formatDuration(45)).toBe('0:45')
    expect(formatDuration(5)).toBe('0:05')
  })

  it('분 단위를 표시한다', () => {
    expect(formatDuration(90)).toBe('1:30')
    expect(formatDuration(180)).toBe('3:00')
  })

  it('음수와 소수를 안전하게 처리한다', () => {
    expect(formatDuration(-10)).toBe('0:00')
    expect(formatDuration(45.9)).toBe('0:45')
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run tests/unit/duration.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/duration"`

- [ ] **Step 3: 최소 구현 작성**

`src/lib/duration.ts`:

```ts
const ISO8601_DURATION = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/

/** ISO8601 기간 문자열을 초로 바꾼다. 형식이 아니면 null. */
export function parseIso8601Duration(value: string): number | null {
  const match = ISO8601_DURATION.exec(value)
  if (!match) return null

  const [, days, hours, minutes, seconds] = match
  // "P", "PT" 처럼 숫자가 전혀 없는 값은 기간이 아니다.
  if (!days && !hours && !minutes && !seconds) return null

  return (
    Number(days ?? 0) * 86_400 +
    Number(hours ?? 0) * 3_600 +
    Number(minutes ?? 0) * 60 +
    Number(seconds ?? 0)
  )
}

/** 초를 "M:SS" 로 표시한다. */
export function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const minutes = Math.floor(safe / 60)
  const seconds = safe % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인**

Run: `npx vitest run tests/unit/duration.test.ts`
Expected: PASS — 10 tests passed

- [ ] **Step 5: 커밋**

```bash
git add src/lib/duration.ts tests/unit/duration.test.ts
git commit -m "feat: ISO8601 영상 길이 파서와 표시 포맷터 추가"
```

---

### Task 3: 쇼츠 필터, 검색어 정규화, 임베드 URL

**Files:**
- Create: `src/lib/types.ts`
- Create: `src/lib/shorts.ts`
- Create: `src/lib/cacheKey.ts`
- Create: `src/lib/embed.ts`
- Test: `tests/unit/shorts.test.ts`
- Test: `tests/unit/cacheKey.test.ts`
- Test: `tests/unit/embed.test.ts`

**Interfaces:**
- Consumes: 없음 (순수 함수만)
- Produces:
  - `type ShortVideo = { id: string; title: string; channelTitle: string; thumbnailUrl: string; durationSeconds: number }`
  - `type VideoSearchResult = { query: string; videos: ShortVideo[]; fromCache: boolean; quotaExceeded: boolean }`
  - `SHORTS_MAX_SECONDS: 180`
  - `filterShorts(videos: ShortVideo[], maxSeconds?: number): ShortVideo[]`
  - `normalizeQuery(raw: string): string`
  - `buildEmbedUrl(videoId: string): string`

- [ ] **Step 1: 타입 파일 작성**

`src/lib/types.ts`:

```ts
export type ShortVideo = {
  id: string
  title: string
  channelTitle: string
  thumbnailUrl: string
  durationSeconds: number
}

export type VideoSearchResult = {
  query: string
  videos: ShortVideo[]
  fromCache: boolean
  quotaExceeded: boolean
}
```

- [ ] **Step 2: 실패하는 테스트 3개 작성**

`tests/unit/shorts.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { SHORTS_MAX_SECONDS, filterShorts } from '@/lib/shorts'
import type { ShortVideo } from '@/lib/types'

function video(id: string, durationSeconds: number): ShortVideo {
  return {
    id,
    title: `제목 ${id}`,
    channelTitle: '채널',
    thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    durationSeconds,
  }
}

describe('filterShorts', () => {
  it('상한이 180초다', () => {
    expect(SHORTS_MAX_SECONDS).toBe(180)
  })

  it('180초 이하를 남긴다', () => {
    const result = filterShorts([video('a', 45), video('b', 180)])
    expect(result.map((v) => v.id)).toEqual(['a', 'b'])
  })

  it('180초를 넘으면 제외한다', () => {
    const result = filterShorts([video('a', 45), video('b', 181), video('c', 1200)])
    expect(result.map((v) => v.id)).toEqual(['a'])
  })

  it('0초 라이브 스트림을 제외한다', () => {
    const result = filterShorts([video('live', 0), video('a', 30)])
    expect(result.map((v) => v.id)).toEqual(['a'])
  })

  it('원래 순서를 유지한다', () => {
    const result = filterShorts([video('c', 30), video('a', 20), video('b', 10)])
    expect(result.map((v) => v.id)).toEqual(['c', 'a', 'b'])
  })

  it('상한을 직접 지정할 수 있다', () => {
    const result = filterShorts([video('a', 45), video('b', 90)], 60)
    expect(result.map((v) => v.id)).toEqual(['a'])
  })
})
```

`tests/unit/cacheKey.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { normalizeQuery } from '@/lib/cacheKey'

describe('normalizeQuery', () => {
  it('앞뒤 공백을 제거한다', () => {
    expect(normalizeQuery('  스쿼트  ')).toBe('스쿼트')
  })

  it('소문자로 바꾼다', () => {
    expect(normalizeQuery('Bench Press')).toBe('bench press')
  })

  it('연속 공백을 한 칸으로 줄인다', () => {
    expect(normalizeQuery('벤치   프레스')).toBe('벤치 프레스')
  })

  it('탭과 줄바꿈도 공백으로 취급한다', () => {
    expect(normalizeQuery('벤치\t\n프레스')).toBe('벤치 프레스')
  })

  it('이미 정규화된 값은 그대로 둔다', () => {
    expect(normalizeQuery('스쿼트')).toBe('스쿼트')
  })

  it('공백만 있으면 빈 문자열이다', () => {
    expect(normalizeQuery('   ')).toBe('')
  })
})
```

`tests/unit/embed.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildEmbedUrl } from '@/lib/embed'

describe('buildEmbedUrl', () => {
  it('영상 ID로 임베드 경로를 만든다', () => {
    expect(buildEmbedUrl('abc123')).toContain('https://www.youtube.com/embed/abc123?')
  })

  it('모바일 자동재생에 필요한 파라미터를 넣는다', () => {
    const params = new URL(buildEmbedUrl('abc123')).searchParams
    expect(params.get('autoplay')).toBe('1')
    expect(params.get('mute')).toBe('1')
    expect(params.get('playsinline')).toBe('1')
  })

  it('단일 영상 반복을 위해 playlist에 같은 ID를 넣는다', () => {
    const params = new URL(buildEmbedUrl('abc123')).searchParams
    expect(params.get('loop')).toBe('1')
    expect(params.get('playlist')).toBe('abc123')
  })

  it('추천 영상과 브랜딩을 줄인다', () => {
    const params = new URL(buildEmbedUrl('abc123')).searchParams
    expect(params.get('rel')).toBe('0')
    expect(params.get('modestbranding')).toBe('1')
  })
})
```

- [ ] **Step 3: 테스트가 실패하는지 확인**

Run: `npx vitest run tests/unit/shorts.test.ts tests/unit/cacheKey.test.ts tests/unit/embed.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/shorts"` 등 3개 파일 모두 해석 실패

- [ ] **Step 4: 최소 구현 작성**

`src/lib/shorts.ts`:

```ts
import type { ShortVideo } from './types'

/** YouTube 공식 쇼츠 상한. */
export const SHORTS_MAX_SECONDS = 180

/**
 * 길이 기준으로 쇼츠만 남긴다.
 * 0초는 라이브 스트림이므로 제외한다.
 */
export function filterShorts(
  videos: ShortVideo[],
  maxSeconds: number = SHORTS_MAX_SECONDS,
): ShortVideo[] {
  return videos.filter((video) => video.durationSeconds > 0 && video.durationSeconds <= maxSeconds)
}
```

`src/lib/cacheKey.ts`:

```ts
/** 캐시 키로 쓸 수 있게 검색어를 정규화한다. */
export function normalizeQuery(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ')
}
```

`src/lib/embed.ts`:

```ts
/**
 * 웹 내부 재생용 임베드 URL을 만든다.
 * mute=1 은 선택이 아니다. 모바일 브라우저는 음소거 자동재생만 허용한다.
 * loop=1 은 단일 영상일 때 playlist 에 같은 ID를 넣어야 동작한다.
 */
export function buildEmbedUrl(videoId: string): string {
  const params = new URLSearchParams({
    autoplay: '1',
    mute: '1',
    loop: '1',
    playlist: videoId,
    playsinline: '1',
    rel: '0',
    modestbranding: '1',
  })
  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`
}
```

- [ ] **Step 5: 테스트가 통과하는지 확인**

Run: `npm test`
Expected: PASS — 4개 파일, 26 tests passed

- [ ] **Step 6: 커밋**

```bash
git add src/lib tests/unit
git commit -m "feat: 쇼츠 필터, 검색어 정규화, 임베드 URL 생성 추가"
```

---

### Task 4: YouTube Data API 클라이언트

**Files:**
- Create: `src/lib/youtube.ts`
- Test: `tests/unit/youtube.test.ts`

**Interfaces:**
- Consumes: `parseIso8601Duration` (Task 2), `filterShorts`·`ShortVideo` (Task 3)
- Produces:
  - `class QuotaExceededError extends Error`
  - `searchShorts(query: string, apiKey: string): Promise<ShortVideo[]>`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/unit/youtube.test.ts`:

```ts
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { QuotaExceededError, searchShorts } from '@/lib/youtube'

const SEARCH = 'https://www.googleapis.com/youtube/v3/search'
const VIDEOS = 'https://www.googleapis.com/youtube/v3/videos'

const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

function videoItem(id: string, duration: string) {
  return {
    id,
    snippet: {
      title: `제목 ${id}`,
      channelTitle: '헬스톡',
      thumbnails: { high: { url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` } },
    },
    contentDetails: { duration },
  }
}

describe('searchShorts', () => {
  it('180초를 넘는 영상을 걸러낸 쇼츠만 반환한다', async () => {
    server.use(
      http.get(SEARCH, () =>
        HttpResponse.json({
          items: [{ id: { videoId: 'a' } }, { id: { videoId: 'b' } }, { id: { videoId: 'c' } }],
        }),
      ),
      http.get(VIDEOS, () =>
        HttpResponse.json({
          items: [videoItem('a', 'PT45S'), videoItem('b', 'PT1M30S'), videoItem('c', 'PT20M')],
        }),
      ),
    )

    const result = await searchShorts('스쿼트', 'test-key')

    expect(result.map((v) => v.id)).toEqual(['a', 'b'])
    expect(result[0]).toEqual({
      id: 'a',
      title: '제목 a',
      channelTitle: '헬스톡',
      thumbnailUrl: 'https://i.ytimg.com/vi/a/hqdefault.jpg',
      durationSeconds: 45,
    })
  })

  it('규정된 검색 파라미터를 보낸다', async () => {
    let captured: URLSearchParams | undefined
    server.use(
      http.get(SEARCH, ({ request }) => {
        captured = new URL(request.url).searchParams
        return HttpResponse.json({ items: [] })
      }),
    )

    await searchShorts('스쿼트', 'test-key')

    expect(captured?.get('type')).toBe('video')
    expect(captured?.get('videoDuration')).toBe('short')
    expect(captured?.get('videoEmbeddable')).toBe('true')
    expect(captured?.get('regionCode')).toBe('KR')
    expect(captured?.get('relevanceLanguage')).toBe('ko')
    expect(captured?.get('maxResults')).toBe('25')
    expect(captured?.get('q')).toBe('스쿼트')
    expect(captured?.get('key')).toBe('test-key')
  })

  it('검색 결과가 없으면 videos 호출을 생략하고 빈 배열을 반환한다', async () => {
    let videosCalled = false
    server.use(
      http.get(SEARCH, () => HttpResponse.json({ items: [] })),
      http.get(VIDEOS, () => {
        videosCalled = true
        return HttpResponse.json({ items: [] })
      }),
    )

    const result = await searchShorts('없는운동', 'test-key')

    expect(result).toEqual([])
    expect(videosCalled).toBe(false)
  })

  it('쿼터 초과면 QuotaExceededError를 던진다', async () => {
    server.use(
      http.get(SEARCH, () =>
        HttpResponse.json(
          { error: { errors: [{ reason: 'quotaExceeded' }] } },
          { status: 403 },
        ),
      ),
    )

    await expect(searchShorts('스쿼트', 'test-key')).rejects.toBeInstanceOf(QuotaExceededError)
  })

  it('쿼터 외의 오류는 일반 Error로 던진다', async () => {
    server.use(http.get(SEARCH, () => HttpResponse.json({}, { status: 500 })))

    const promise = searchShorts('스쿼트', 'test-key')
    await expect(promise).rejects.toThrow(/500/)
    await expect(promise).rejects.not.toBeInstanceOf(QuotaExceededError)
  })

  it('high 썸네일이 없으면 medium, default 순으로 대체한다', async () => {
    server.use(
      http.get(SEARCH, () => HttpResponse.json({ items: [{ id: { videoId: 'a' } }] })),
      http.get(VIDEOS, () =>
        HttpResponse.json({
          items: [
            {
              id: 'a',
              snippet: {
                title: '제목 a',
                channelTitle: '헬스톡',
                thumbnails: { default: { url: 'https://i.ytimg.com/vi/a/default.jpg' } },
              },
              contentDetails: { duration: 'PT30S' },
            },
          ],
        }),
      ),
    )

    const result = await searchShorts('스쿼트', 'test-key')

    expect(result[0].thumbnailUrl).toBe('https://i.ytimg.com/vi/a/default.jpg')
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run tests/unit/youtube.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/youtube"`

- [ ] **Step 3: 최소 구현 작성**

`src/lib/youtube.ts`:

```ts
import { parseIso8601Duration } from './duration'
import { filterShorts } from './shorts'
import type { ShortVideo } from './types'

const DEFAULT_API_BASE = 'https://www.googleapis.com/youtube/v3'

/** YouTube 일일 쿼터가 소진된 상태. 캐시 폴백으로 전환하는 신호다. */
export class QuotaExceededError extends Error {
  constructor() {
    super('YouTube API quota exceeded')
    this.name = 'QuotaExceededError'
  }
}

type SearchItem = { id?: { videoId?: string } }

type Thumbnail = { url: string }

type VideoItem = {
  id: string
  snippet: {
    title: string
    channelTitle: string
    thumbnails: { high?: Thumbnail; medium?: Thumbnail; default?: Thumbnail }
  }
  contentDetails: { duration: string }
}

function apiBase(): string {
  return process.env.YOUTUBE_API_BASE || DEFAULT_API_BASE
}

async function readJson<T>(response: Response, label: string): Promise<T> {
  if (response.ok) return (await response.json()) as T

  const body = await response.text()
  if (response.status === 403 && body.includes('quotaExceeded')) {
    throw new QuotaExceededError()
  }
  throw new Error(`YouTube ${label} 호출 실패: ${response.status} ${body}`)
}

function pickThumbnail(thumbnails: VideoItem['snippet']['thumbnails']): string {
  return thumbnails.high?.url ?? thumbnails.medium?.url ?? thumbnails.default?.url ?? ''
}

/**
 * 운동 이름으로 쇼츠를 찾는다.
 * search.list 는 실제 길이를 주지 않으므로 videos.list 로 한 번 더 확인한다.
 * 비용: search.list 100 units + videos.list 1 unit = 101 units.
 */
export async function searchShorts(query: string, apiKey: string): Promise<ShortVideo[]> {
  const searchParams = new URLSearchParams({
    key: apiKey,
    part: 'id',
    q: query,
    type: 'video',
    videoDuration: 'short',
    videoEmbeddable: 'true',
    regionCode: 'KR',
    relevanceLanguage: 'ko',
    maxResults: '25',
  })

  const searchResponse = await fetch(`${apiBase()}/search?${searchParams.toString()}`)
  const searchJson = await readJson<{ items?: SearchItem[] }>(searchResponse, 'search')

  const ids = (searchJson.items ?? [])
    .map((item) => item.id?.videoId)
    .filter((id): id is string => Boolean(id))

  if (ids.length === 0) return []

  const videosParams = new URLSearchParams({
    key: apiKey,
    part: 'snippet,contentDetails',
    id: ids.join(','),
  })

  const videosResponse = await fetch(`${apiBase()}/videos?${videosParams.toString()}`)
  const videosJson = await readJson<{ items?: VideoItem[] }>(videosResponse, 'videos')

  const videos: ShortVideo[] = (videosJson.items ?? []).map((item) => ({
    id: item.id,
    title: item.snippet.title,
    channelTitle: item.snippet.channelTitle,
    thumbnailUrl: pickThumbnail(item.snippet.thumbnails),
    durationSeconds: parseIso8601Duration(item.contentDetails.duration) ?? 0,
  }))

  return filterShorts(videos)
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인**

Run: `npm test`
Expected: PASS — 32 tests passed

- [ ] **Step 5: 커밋**

```bash
git add src/lib/youtube.ts tests/unit/youtube.test.ts
git commit -m "feat: YouTube 쇼츠 검색 클라이언트 추가 (2단계 호출, 쿼터 오류 판별)"
```

---

### Task 5: 검색 캐시

**Files:**
- Create: `supabase/migrations/0001_search_cache.sql`
- Create: `src/lib/searchCache.ts`
- Test: `tests/unit/searchCache.test.ts`

**Interfaces:**
- Consumes: `normalizeQuery` (Task 3), `ShortVideo` (Task 3), `@supabase/supabase-js`
- Produces:
  - `CACHE_TTL_MS: number` (7일)
  - `isCacheFresh(createdAt: string, now: number): boolean`
  - `readCache(query: string, options?: { allowStale?: boolean; now?: number }): Promise<ShortVideo[] | null>`
  - `writeCache(query: string, videos: ShortVideo[]): Promise<void>`

- [ ] **Step 1: 마이그레이션 작성**

`supabase/migrations/0001_search_cache.sql`:

```sql
create table if not exists public.search_cache (
  query_key  text        primary key,
  payload    jsonb       not null,
  created_at timestamptz not null default now()
);

-- RLS를 켜고 정책을 만들지 않는다.
-- anon/authenticated 는 접근할 수 없고, 서버가 쓰는 service_role 만 RLS를 우회한다.
alter table public.search_cache enable row level security;
```

Supabase 콘솔의 SQL Editor에 붙여 실행한다.

- [ ] **Step 2: 실패하는 테스트 작성**

`tests/unit/searchCache.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CACHE_TTL_MS, isCacheFresh, readCache, writeCache } from '@/lib/searchCache'

const NOW = new Date('2026-07-25T00:00:00.000Z').getTime()

function daysAgo(days: number): string {
  return new Date(NOW - days * 24 * 60 * 60 * 1000).toISOString()
}

describe('isCacheFresh', () => {
  it('TTL이 7일이다', () => {
    expect(CACHE_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000)
  })

  it('방금 만든 항목은 신선하다', () => {
    expect(isCacheFresh(daysAgo(0), NOW)).toBe(true)
  })

  it('6일 전 항목은 신선하다', () => {
    expect(isCacheFresh(daysAgo(6), NOW)).toBe(true)
  })

  it('8일 전 항목은 만료됐다', () => {
    expect(isCacheFresh(daysAgo(8), NOW)).toBe(false)
  })

  it('날짜로 해석할 수 없으면 만료로 본다', () => {
    expect(isCacheFresh('언젠가', NOW)).toBe(false)
  })
})

describe('Supabase 환경변수가 없을 때', () => {
  const saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY }

  beforeEach(() => {
    delete process.env.SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
  })

  afterEach(() => {
    if (saved.url) process.env.SUPABASE_URL = saved.url
    if (saved.key) process.env.SUPABASE_SERVICE_ROLE_KEY = saved.key
  })

  it('읽기는 null을 반환한다', async () => {
    await expect(readCache('스쿼트')).resolves.toBeNull()
  })

  it('쓰기는 조용히 성공한다', async () => {
    await expect(writeCache('스쿼트', [])).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 3: 테스트가 실패하는지 확인**

Run: `npx vitest run tests/unit/searchCache.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/searchCache"`

- [ ] **Step 4: 최소 구현 작성**

`src/lib/searchCache.ts`:

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { normalizeQuery } from './cacheKey'
import type { ShortVideo } from './types'

export const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000

const TABLE = 'search_cache'

/**
 * 캐시는 선택 기능이다.
 * 환경변수가 없으면 null을 돌려 캐시 없이 동작하게 한다.
 */
function getClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

export function isCacheFresh(createdAt: string, now: number): boolean {
  const created = new Date(createdAt).getTime()
  if (Number.isNaN(created)) return false
  return now - created <= CACHE_TTL_MS
}

/**
 * 캐시된 검색 결과를 읽는다.
 * allowStale 은 쿼터 초과 폴백용이다. 만료된 결과라도 빈 화면보다 낫다.
 * 캐시 장애는 검색을 실패시키지 않는다. 어떤 오류든 null로 흡수한다.
 */
export async function readCache(
  query: string,
  options: { allowStale?: boolean; now?: number } = {},
): Promise<ShortVideo[] | null> {
  const client = getClient()
  if (!client) return null

  const { allowStale = false, now = Date.now() } = options

  try {
    const { data, error } = await client
      .from(TABLE)
      .select('payload, created_at')
      .eq('query_key', normalizeQuery(query))
      .maybeSingle()

    if (error || !data) return null
    if (!allowStale && !isCacheFresh(data.created_at as string, now)) return null
    return data.payload as ShortVideo[]
  } catch {
    return null
  }
}

/** 검색 결과를 캐시에 저장한다. 실패는 무시한다. */
export async function writeCache(query: string, videos: ShortVideo[]): Promise<void> {
  const client = getClient()
  if (!client) return

  try {
    await client.from(TABLE).upsert({
      query_key: normalizeQuery(query),
      payload: videos,
      created_at: new Date().toISOString(),
    })
  } catch {
    // 캐시 쓰기 실패는 사용자에게 영향이 없다.
  }
}
```

- [ ] **Step 5: 테스트가 통과하는지 확인**

Run: `npm test`
Expected: PASS — 39 tests passed

- [ ] **Step 6: 커밋**

```bash
git add supabase src/lib/searchCache.ts tests/unit/searchCache.test.ts
git commit -m "feat: Supabase 검색 캐시 추가 (7일 TTL, 장애 시 무해하게 건너뜀)"
```

---

### Task 5b: Supabase 없이도 쿼터를 아끼는 메모리 캐시 폴백

**Files:**
- Modify: `src/lib/searchCache.ts`
- Modify: `tests/unit/searchCache.test.ts`

**Interfaces:**
- Consumes: Task 5의 `CACHE_TTL_MS`, `isCacheFresh`, `readCache`, `writeCache`, `normalizeQuery`
- Produces: `clearMemoryCache(): void` — 테스트 전용. 프로세스 내 캐시를 비운다.
- 변경 없음: `readCache`·`writeCache`의 시그니처와 외부 동작 계약은 그대로다

**왜 필요한가**

Supabase 환경변수가 없으면 Task 5의 캐시는 완전한 no-op이다. 앱은 정상 동작하지만
같은 검색어를 반복해도 매번 쿼터 101 units를 쓴다. 일일 무료 한도 10,000이면
하루 약 99회가 전부여서 개발 중 반나절에 소진된다.

프로세스 내 `Map`을 폴백으로 두면 Supabase를 설정하지 않은 상태에서도 같은 세션의
반복 검색이 무료가 된다. 프로세스가 죽으면 사라지고 Vercel 인스턴스 간에 공유되지도
않지만, 그건 Supabase를 설정하면 해결되는 문제다. 이 폴백의 목적은 **Supabase 없이
개발을 시작할 수 있게 하는 것**뿐이다.

- [ ] **Step 1: 실패하는 테스트 추가**

`tests/unit/searchCache.test.ts`의 기존 `describe('Supabase 환경변수가 없을 때', ...)`
블록을 아래로 교체한다. `clearMemoryCache`를 import에 추가한다.

```ts
describe('Supabase 환경변수가 없을 때', () => {
  const saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY }

  beforeEach(() => {
    delete process.env.SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    clearMemoryCache()
  })

  afterEach(() => {
    if (saved.url) process.env.SUPABASE_URL = saved.url
    if (saved.key) process.env.SUPABASE_SERVICE_ROLE_KEY = saved.key
  })

  it('쓰지 않은 검색어는 null을 반환한다', async () => {
    await expect(readCache('스쿼트')).resolves.toBeNull()
  })

  it('쓰기는 조용히 성공한다', async () => {
    await expect(writeCache('스쿼트', [])).resolves.toBeUndefined()
  })

  it('쓴 결과를 메모리에서 다시 읽는다', async () => {
    const videos = [
      {
        id: 'a',
        title: '스쿼트 기본',
        channelTitle: '헬스톡',
        thumbnailUrl: 'https://i.ytimg.com/vi/a/hqdefault.jpg',
        durationSeconds: 45,
      },
    ]

    await writeCache('스쿼트', videos)

    await expect(readCache('스쿼트')).resolves.toEqual(videos)
  })

  it('정규화된 검색어를 키로 쓴다', async () => {
    await writeCache('  스쿼트  ', [])

    await expect(readCache('스쿼트')).resolves.toEqual([])
  })

  it('TTL이 지난 메모리 항목은 null을 반환한다', async () => {
    await writeCache('스쿼트', [])
    const later = Date.now() + CACHE_TTL_MS + 1

    await expect(readCache('스쿼트', { now: later })).resolves.toBeNull()
  })

  it('allowStale이면 TTL이 지난 메모리 항목도 반환한다', async () => {
    await writeCache('스쿼트', [])
    const later = Date.now() + CACHE_TTL_MS + 1

    await expect(readCache('스쿼트', { allowStale: true, now: later })).resolves.toEqual([])
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run tests/unit/searchCache.test.ts`
Expected: FAIL — `clearMemoryCache` is not exported, 그리고 "쓴 결과를 메모리에서 다시 읽는다"가
`null`을 받아 실패한다

- [ ] **Step 3: 메모리 폴백 구현**

`src/lib/searchCache.ts`에 추가하고 `readCache`·`writeCache`를 수정한다.
`getClient()`, `isCacheFresh`, `CACHE_TTL_MS`는 건드리지 않는다.

```ts
type MemoryEntry = { payload: ShortVideo[]; createdAt: number }

/**
 * Supabase 환경변수가 없을 때만 쓰는 프로세스 내 폴백.
 * 프로세스가 죽으면 사라지고 인스턴스 간에 공유되지 않는다.
 * 목적은 Supabase 설정 없이 개발할 때 같은 검색어 반복이 쿼터를 태우지 않게 하는 것뿐이다.
 */
const memoryCache = new Map<string, MemoryEntry>()

/** 테스트 전용. 프로세스 내 폴백 캐시를 비운다. */
export function clearMemoryCache(): void {
  memoryCache.clear()
}

function readMemory(
  key: string,
  allowStale: boolean,
  now: number,
): ShortVideo[] | null {
  const entry = memoryCache.get(key)
  if (!entry) return null
  if (!allowStale && now - entry.createdAt > CACHE_TTL_MS) return null
  return entry.payload
}
```

`readCache`의 `if (!client) return null` 을 아래로 바꾼다.

```ts
  const { allowStale = false, now = Date.now() } = options
  const key = normalizeQuery(query)

  if (!client) return readMemory(key, allowStale, now)
```

이후 본문에서 `normalizeQuery(query)` 대신 `key`를 쓴다.

`writeCache`의 `if (!client) return` 을 아래로 바꾼다.

```ts
  const key = normalizeQuery(query)

  if (!client) {
    memoryCache.set(key, { payload: videos, createdAt: Date.now() })
    return
  }
```

이후 본문에서 `normalizeQuery(query)` 대신 `key`를 쓴다.

`ShortVideo` import가 이미 있는지 확인한다.

- [ ] **Step 4: 테스트가 통과하는지 확인**

Run: `npm test`
Expected: PASS — 52 tests passed (Task 4b 완료 후 48에서, 환경변수 없을 때 블록이 2개 → 6개로 늘어 +4)

> 실행 순서는 **Task 4b → 5b → 5c**다. 누적 테스트 개수는 48 → 52 → 55.
> 순서를 바꾸면 각 태스크의 기대 개수도 달라진다.

- [ ] **Step 5: 커밋**

```bash
git add src/lib/searchCache.ts tests/unit/searchCache.test.ts
git commit -m "feat: Supabase 없이도 쿼터를 아끼는 메모리 캐시 폴백 추가"
```

---

### Task 5c: 캐시 장애를 보이게 만들기

**Files:**
- Modify: `src/lib/searchCache.ts`
- Modify: `tests/unit/searchCache.test.ts`
- Create: `tests/setup.ts`
- Modify: `vitest.config.ts` (`setupFiles` 추가)
- Create: `scripts/check-cache.ts`
- Modify: `package.json` (`cache:check` 스크립트 추가)

**Interfaces:**
- 변경 없음: `readCache`·`writeCache`의 시그니처와 반환값 계약. 사용자에게 보이는 동작은 그대로다
- Produces: `npm run cache:check` — 실제 Supabase에 왕복 검증

**왜 필요한가**

Task 5 리뷰가 지적한 것: `readCache`·`writeCache`의 성공 경로에 테스트가 없다.
Supabase의 HTTP 와이어 포맷을 목으로 흉내내는 테스트는 "우리가 목을 올바르게 호출했다"만
증명하고 "PostgREST가 이 요청을 받아들인다"는 증명하지 못한다. 그래서 목 테스트 대신
두 가지로 막는다.

진짜 위험은 **침묵**이다. 이 모듈은 모든 오류를 삼킨다. 컬럼명 오타나 마이그레이션 미실행으로
캐시가 완전히 죽어도 앱은 정상 동작하고 쿼터만 태운다. 하루 약 99회면 소진되는데 원인을
알 방법이 없다.

1. **오류를 서버 로그로 남긴다.** 사용자에게 보이는 동작은 그대로 유지한다 — 여전히
   `null`을 반환하고 예외를 던지지 않는다. 로그만 추가된다. 우아한 degrade는 유지하면서
   장애가 발견 가능해진다.
2. **`npm run cache:check`로 실제 왕복을 검증한다.** 목이 아니라 진짜 Supabase에 쓰고
   읽어서 마이그레이션 실행 여부와 키 권한을 한 번에 확인한다. 셋업 직후 한 번 돌리면
   된다.

- [ ] **Step 1: 실패하는 테스트 추가**

`tests/unit/searchCache.test.ts` 맨 아래에 추가한다. import에 `vi`를 포함한다.

```ts
describe('Supabase 호출이 실패할 때', () => {
  const saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY }

  beforeEach(() => {
    // 도달할 수 없는 호스트를 가리켜 호출을 실패시킨다.
    process.env.SUPABASE_URL = 'http://127.0.0.1:1'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
    clearMemoryCache()
  })

  afterEach(() => {
    if (saved.url) process.env.SUPABASE_URL = saved.url
    else delete process.env.SUPABASE_URL
    if (saved.key) process.env.SUPABASE_SERVICE_ROLE_KEY = saved.key
    else delete process.env.SUPABASE_SERVICE_ROLE_KEY
    vi.restoreAllMocks()
  })

  it('읽기 실패는 null을 반환하고 예외를 던지지 않는다', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(readCache('스쿼트')).resolves.toBeNull()
  })

  it('읽기 실패를 경고로 남긴다', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await readCache('스쿼트')

    expect(warn).toHaveBeenCalled()
    expect(String(warn.mock.calls[0]?.[0])).toContain('search_cache')
  })

  it('쓰기 실패는 조용히 성공하고 경고를 남긴다', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(writeCache('스쿼트', [])).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run tests/unit/searchCache.test.ts`
Expected: FAIL — "읽기 실패를 경고로 남긴다"가 `console.warn` 호출 0회로 실패한다

- [ ] **Step 3: 경고 로그 추가**

`src/lib/searchCache.ts`에 헬퍼를 추가한다.

```ts
/**
 * 캐시 장애를 서버 로그로만 남긴다.
 * 사용자에게 보이는 동작은 바꾸지 않는다 — 캐시는 성능 최적화이지 정확성 의존성이 아니다.
 * 로그가 없으면 컬럼명 오타나 마이그레이션 미실행으로 캐시가 완전히 죽어도
 * 앱은 정상 동작하는 것처럼 보이고 쿼터만 태운다.
 */
function warnCacheFailure(operation: string, cause: unknown): void {
  const reason = cause instanceof Error ? cause.message : String(cause)
  console.warn(`[search_cache] ${operation} 실패 — 캐시를 건너뜁니다: ${reason}`)
}
```

`readCache`의 Supabase 경로를 수정한다. `error`가 있을 때와 예외가 났을 때 모두 로그를
남긴다. **행이 없는 정상적인 캐시 미스(`!data`)는 로그를 남기지 않는다** — 그건 장애가
아니라 흔한 일이다.

```ts
    const { data, error } = await client
      .from(TABLE)
      .select('payload, created_at')
      .eq('query_key', key)
      .maybeSingle()

    if (error) {
      warnCacheFailure('읽기', error.message)
      return null
    }
    if (!data) return null
    if (!allowStale && !isCacheFresh(data.created_at as string, now)) return null
    return data.payload as ShortVideo[]
  } catch (cause) {
    warnCacheFailure('읽기', cause)
    return null
  }
```

`writeCache`도 같은 방식으로 수정한다. `upsert`의 반환값에서 `error`를 확인한다.

```ts
  try {
    const { error } = await client.from(TABLE).upsert({
      query_key: key,
      payload: videos,
      created_at: new Date().toISOString(),
    })

    if (error) warnCacheFailure('쓰기', error.message)
  } catch (cause) {
    warnCacheFailure('쓰기', cause)
  }
```

- [ ] **Step 4: 테스트가 통과하는지 확인**

Run: `npm test`
Expected: PASS — 55 tests passed (기존 52 + 3)

출력에 `[search_cache]` 경고가 새는지 확인한다. 테스트가 `console.warn`을 목으로 막으므로
출력은 깨끗해야 한다.

- [ ] **Step 5: 메모리 캐시 전역 정리 훅 추가**

Task 5b가 `searchCache`를 모듈 수준 `Map`을 든 상태 있는 모듈로 만들었다. 지금은
파일마다 `clearMemoryCache()`를 잊지 않고 부르는 규율에 의존한다. Vitest의 파일 격리
기본값 덕에 현재는 새지 않지만, 그건 우연한 완화이지 이 코드가 만든 보장이 아니다.
훅을 빠뜨리면 테스트가 **실패하지 않고 조용히 무의미해진다** — 캐시 히트를 받아
검증하려던 경로를 아예 타지 않는다.

`tests/setup.ts`:

```ts
import { afterEach } from 'vitest'
import { clearMemoryCache } from '@/lib/searchCache'

/**
 * searchCache 는 모듈 수준 Map 을 들고 있다.
 * 파일마다 비우는 것을 기억하는 대신 전역으로 비운다.
 * 빠뜨리면 테스트가 실패하지 않고 조용히 캐시 히트를 받아 무의미해진다.
 */
afterEach(() => {
  clearMemoryCache()
})
```

`vitest.config.ts`의 `test` 블록에 한 줄 추가한다. 나머지는 건드리지 않는다.

```ts
    setupFiles: ['./tests/setup.ts'],
```

기존 테스트 파일의 `clearMemoryCache()` 호출은 그대로 둔다. 중복이지만 그 파일만 읽는
사람에게 의도를 보여준다.

- [ ] **Step 6: 전역 훅이 동작하는지 확인**

Run: `npm test`
Expected: PASS — 55 tests passed. 개수는 Step 4와 같다. 이 단계는 새 테스트를 더하지
않고 기존 테스트가 서로를 오염시키지 않게 보장한다.

- [ ] **Step 7: 왕복 검증 스크립트 작성**

`scripts/check-cache.ts`:

```ts
import { readCache, writeCache } from '../src/lib/searchCache'

/**
 * 실제 Supabase에 쓰고 읽어서 캐시가 정말 동작하는지 확인한다.
 * 마이그레이션 실행 여부, service_role 키 권한, 테이블·컬럼명을 한 번에 검증한다.
 * 목 테스트로는 PostgREST가 요청을 받아들이는지 알 수 없어서 이 스크립트가 필요하다.
 */
async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 없습니다.')
    console.log('캐시 없이도 앱은 동작합니다. 다만 같은 검색어도 매번 쿼터를 씁니다.')
    return
  }

  const probeQuery = '__cache_check__'
  const probe = [
    {
      id: 'probe',
      title: '왕복 검증',
      channelTitle: 'check',
      thumbnailUrl: 'https://i.ytimg.com/vi/probe/hqdefault.jpg',
      durationSeconds: 42,
    },
  ]

  await writeCache(probeQuery, probe)
  const readBack = await readCache(probeQuery)

  if (!readBack) {
    console.error('실패: 쓴 값을 다시 읽지 못했습니다.')
    console.error('supabase/migrations/0001_search_cache.sql 을 실행했는지,')
    console.error('SUPABASE_SERVICE_ROLE_KEY 가 anon 키가 아닌 service_role 키인지 확인하세요.')
    console.error('위에 [search_cache] 경고가 있으면 그게 원인입니다.')
    process.exitCode = 1
    return
  }

  if (readBack[0]?.durationSeconds !== 42) {
    console.error('실패: 읽은 값이 쓴 값과 다릅니다.', readBack)
    process.exitCode = 1
    return
  }

  console.log('성공: 캐시 쓰기와 읽기가 정상입니다.')
}

void main()
```

`package.json`의 `scripts`에 추가한다.

```json
"cache:check": "tsx --env-file=.env.local scripts/check-cache.ts"
```

`tsx`는 Task 1에서 이미 설치했다.

- [ ] **Step 8: 커밋**

```bash
git add src/lib/searchCache.ts tests/unit/searchCache.test.ts tests/setup.ts vitest.config.ts scripts/check-cache.ts package.json
git commit -m "feat: 캐시 장애를 서버 로그와 왕복 검증 스크립트로 드러냄

모든 오류를 삼키는 설계라 컬럼명 오타나 마이그레이션 미실행으로 캐시가
완전히 죽어도 앱은 정상 동작하는 것처럼 보이고 쿼터만 태운다.
사용자에게 보이는 동작은 그대로 두고 서버 로그만 추가했다."
```

---

### Task 5d: 캐시 테스트를 MSW로 바꿔 14초를 되찾고 성공 경로를 검증

**Files:**
- Modify: `tests/unit/searchCache.test.ts`
- Modify: `src/lib/searchCache.ts` (주석 한 줄만)
- Modify: `scripts/check-cache.ts` (탐침 행 정리)

**Interfaces:**
- `searchCache.ts`의 동작은 바꾸지 않는다. 낡은 주석 한 줄만 고친다
- 이 태스크는 **조사가 필요하다.** 아래 코드는 출발점이지 받아쓸 정답이 아니다

**왜 필요한가**

두 가지를 한 번에 해결한다.

**1. 테스트가 14초 느리다.** Task 5c의 실패 테스트는 `SUPABASE_URL`을
`http://127.0.0.1:1`로 두어 실제 연결을 시도한다. 측정 결과:

```
읽기 실패는 null을 반환하고 예외를 던지지 않는다   7072ms
읽기 실패를 경고로 남긴다                        7040ms
쓰기 실패는 조용히 성공하고 경고를 남긴다             8ms
```

전체 스위트가 891ms에서 15.8초가 됐다. 남은 태스크마다 이 비용을 낸다.

**2. Supabase 성공 경로에 테스트가 없다.** Task 5 리뷰의 Important 지적이다.
`.from(TABLE).select('payload, created_at').eq('query_key', key).maybeSingle()`이
정말 올바른 요청을 만드는지, `upsert` 본문이 맞는지 아무것도 검증하지 않는다.
모든 오류를 삼키는 설계라 테이블명이나 컬럼명이 틀려도 조용히 죽는다.

MSW로 Supabase REST 엔드포인트를 가로채면 둘 다 해결된다. 즉시 응답하므로 빠르고,
**우리가 실제로 보내는 URL·쿼리·본문을 검증**하므로 성공 경로가 덮인다.

- [ ] **Step 1: 실제 요청 모양을 확인한다**

`@supabase/supabase-js`가 어떤 HTTP 요청을 만드는지 먼저 관찰한다. 추측하지 말고 찍어본다.
임시 테스트를 하나 만들어 MSW로 모든 요청을 가로채고 URL·메서드·헤더·본문을 출력한다.

```ts
server.use(
  http.all('http://supabase.test/*', async ({ request }) => {
    console.log(request.method, request.url)
    console.log('accept:', request.headers.get('accept'))
    if (request.method !== 'GET') console.log('body:', await request.clone().text())
    return HttpResponse.json([])
  }),
)
```

`readCache`와 `writeCache`를 한 번씩 호출해 출력을 확인하고, **관찰한 내용을 보고서에
그대로 기록한다.** 특히 `maybeSingle()`이 보내는 `Accept` 헤더와, 그것이 응답을 배열로
기대하는지 단일 객체로 기대하는지 확인한다. 이 관찰 결과가 Step 2의 응답 모양을 결정한다.
확인 후 임시 테스트는 지운다.

- [ ] **Step 2: 실패 테스트를 MSW로 교체**

`tests/unit/searchCache.test.ts`의 `describe('Supabase 호출이 실패할 때', ...)` 블록을
MSW 기반으로 바꾼다. 파일 상단에 MSW 서버를 세운다.

```ts
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'

const SUPABASE_URL = 'http://supabase.test'
const CACHE_ENDPOINT = `${SUPABASE_URL}/rest/v1/search_cache`

const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
```

실패 블록의 `beforeEach`에서 환경변수를 `SUPABASE_URL`로 설정하고 핸들러가
`HttpResponse.error()`(네트워크 오류 시뮬레이션)를 반환하게 한다. 기존 3개 테스트의
단정(`null` 반환, `console.warn` 호출, `undefined` 반환)은 그대로 유지한다.

- [ ] **Step 3: 실패 테스트가 빨라졌는지 확인**

Run: `npx vitest run tests/unit/searchCache.test.ts --reporter=verbose`
Expected: 세 개의 실패 테스트가 각각 **100ms 미만**. 파일 전체가 1초 미만.

7초짜리가 남아 있으면 MSW가 요청을 가로채지 못하고 실제 네트워크로 나간 것이다.
`onUnhandledRequest: 'error'`가 켜져 있으면 그 경우 테스트가 실패하므로 바로 드러난다.

- [ ] **Step 4: 성공 경로 테스트 추가**

새 `describe('Supabase가 정상일 때', ...)` 블록을 추가한다. Step 1에서 관찰한 실제 요청
모양에 맞춰 작성한다. 다음 네 가지를 덮는다.

1. **읽기가 저장된 결과를 반환한다** — 핸들러가 신선한 `created_at`과 `ShortVideo` 배열
   payload를 담은 행을 반환하면 `readCache`가 그 배열을 그대로 돌려준다
2. **올바른 테이블과 쿼리로 요청한다** — 핸들러에서 요청 URL을 붙잡아 경로가
   `/rest/v1/search_cache`이고, `select`에 `payload`와 `created_at`이 들어 있고,
   `query_key` 필터가 **정규화된** 검색어(`'  스쿼트  '` → `'스쿼트'`)인지 단정한다
3. **TTL이 지난 행은 null을 반환한다** — 8일 전 `created_at`을 반환하는 핸들러.
   `allowStale: true`면 같은 행을 돌려준다
4. **쓰기가 올바른 본문을 보낸다** — 핸들러에서 POST 본문을 파싱해 `query_key`가
   정규화돼 있고 `payload`가 넘긴 배열과 같은지 단정한다

2번과 4번이 이 태스크의 핵심이다. 테이블명·컬럼명 오타를 잡는 유일한 자동 검증이다.

- [ ] **Step 5: 캐시 미스가 조용한지 검증하는 테스트 추가**

Task 5c 리뷰의 지적이다. `readCache`는 `error`가 있을 때만 경고하고 행이 없을 때
(`!data`)는 조용해야 한다. 캐시 미스는 장애가 아니라 첫 검색마다 일어나는 일이라,
여기서 로그를 남기면 콘솔이 범람한다. 코드는 맞지만 이를 지키는 테스트가 없어
나중에 리팩터링하면서 되살아나도 아무도 모른다.

`describe('Supabase가 정상일 때', ...)`에 추가한다.

```ts
  it('행이 없으면 null을 반환하고 경고하지 않는다', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // 핸들러가 "행 없음"을 반환하도록 설정한다 (Step 1에서 관찰한 형태로).

    await expect(readCache('없는운동')).resolves.toBeNull()

    expect(warn).not.toHaveBeenCalled()
  })
```

- [ ] **Step 6: 낡은 주석과 탐침 행 정리**

`src/lib/searchCache.ts`의 `writeCache` 위 주석이 실제 동작과 어긋난다.
Task 5c에서 실패를 로그로 남기게 됐으므로 "실패는 무시한다"는 더 이상 정확하지 않다.

```ts
/** 검색 결과를 캐시에 저장한다. 실패는 로그만 남기고 삼킨다. */
```

`scripts/check-cache.ts`가 `__cache_check__` 행을 프로덕션 테이블에 남긴다.
고정 키라 무한히 쌓이지는 않지만, 성공 후 지우는 편이 깔끔하다. 성공 경로 마지막,
"성공" 출력 직전에 정리를 넣는다. 정리 실패는 검증 결과를 뒤집지 않는다.

```ts
  await deleteProbe(probeQuery)
  console.log('성공: 캐시 쓰기와 읽기가 정상입니다.')
```

`deleteProbe`는 `getClient()`를 쓸 수 없으므로(비공개) `searchCache.ts`에서 가져오지
말고, 스크립트 안에서 `createClient`로 직접 만들어 `.from('search_cache').delete()
.eq('query_key', key)`를 호출하고 오류는 무시한다.

- [ ] **Step 7: 전체 확인**

Run: `npm test`
Expected: PASS — 60 tests passed (기존 55 + 성공 경로 4개 + 미스 침묵 1개). 출력 깨끗.
**전체 소요 시간이 2초 미만인지 확인한다.**

> Task 6이 먼저 끝났다면 기준선이 60이므로 총 65가 된다. 실행 순서에 따라 달라지니
> 시작 전에 `npm test`로 현재 개수를 확인하고 그 값에 5를 더한 수를 기대하라.

Run: `npx tsc --noEmit`
Expected: 클린

- [ ] **Step 8: 커밋**

```bash
git add tests/unit/searchCache.test.ts src/lib/searchCache.ts scripts/check-cache.ts
git commit -m "test: 캐시 테스트를 MSW로 바꿔 14초 단축하고 Supabase 성공 경로 검증

도달 불가 포트로 실제 연결을 시도하던 실패 테스트가 각각 7초씩 걸렸다.
MSW로 가로채면 즉시 응답하고, 동시에 우리가 보내는 URL·쿼리·본문을 검증하므로
테이블명·컬럼명 오타를 잡는 자동 검증이 생긴다. 모든 오류를 삼키는 설계라
그 오타는 지금까지 조용히 캐시를 죽이기만 했다."
```

---

### Task 4b: 레이트리밋도 쿼터 소진으로 판별

**Files:**
- Modify: `src/lib/youtube.ts`
- Modify: `tests/unit/youtube.test.ts`

**Interfaces:**
- Produces: `isQuotaFailure(status: number, body: string): boolean` — 순수 함수, 직접 테스트 가능
- 변경 없음: `searchShorts`와 `QuotaExceededError`의 시그니처

**왜 필요한가**

Task 4의 `readJson`은 `response.status === 403 && body.includes('quotaExceeded')` 로만
쿼터 소진을 판별한다. 그런데 Google은 같은 "요청을 줄여라" 상황을 두 가지 다른 방식으로도
알린다.

- 403 + `rateLimitExceeded` 또는 `userRateLimitExceeded` (초당·분당 요청 제한)
- 429 (레이트리밋)

이 둘은 현재 일반 `Error`로 던져진다. Task 6은 `QuotaExceededError`만 잡아 캐시 폴백으로
전환하므로, 레이트리밋에 걸리면 우아한 degrade 대신 크래시 화면이 뜬다. 우아한 degrade를
위해 만든 장치가 정작 가장 흔한 경우에 작동하지 않는다.

배너 문구도 함께 고친다. "오늘 검색 한도에 도달했어요"는 일일 쿼터에는 맞지만 분당
레이트리밋에는 틀린 설명이다. 두 경우 모두에 정확한 문구로 바꾼다.

- [ ] **Step 1: 실패하는 테스트 추가**

`tests/unit/youtube.test.ts`의 import에 `isQuotaFailure`를 추가하고, 기존
`describe('searchShorts', ...)` 블록 **뒤에** 아래를 추가한다.

```ts
describe('isQuotaFailure', () => {
  it('403 + quotaExceeded 는 쿼터 소진이다', () => {
    expect(isQuotaFailure(403, '{"error":{"errors":[{"reason":"quotaExceeded"}]}}')).toBe(true)
  })

  it('403 + rateLimitExceeded 는 쿼터 소진으로 본다', () => {
    expect(isQuotaFailure(403, '{"error":{"errors":[{"reason":"rateLimitExceeded"}]}}')).toBe(true)
  })

  it('403 + userRateLimitExceeded 는 쿼터 소진으로 본다', () => {
    expect(
      isQuotaFailure(403, '{"error":{"errors":[{"reason":"userRateLimitExceeded"}]}}'),
    ).toBe(true)
  })

  it('429 는 본문과 무관하게 쿼터 소진이다', () => {
    expect(isQuotaFailure(429, '')).toBe(true)
  })

  it('쿼터와 무관한 403 은 쿼터 소진이 아니다', () => {
    expect(isQuotaFailure(403, '{"error":{"errors":[{"reason":"forbidden"}]}}')).toBe(false)
  })

  it('500 은 쿼터 소진이 아니다', () => {
    expect(isQuotaFailure(500, 'quotaExceeded')).toBe(false)
  })
})
```

그리고 `describe('searchShorts', ...)` 안에 아래 3개를 추가한다.

```ts
  it('403 rateLimitExceeded 면 QuotaExceededError를 던진다', async () => {
    server.use(
      http.get(SEARCH, () =>
        HttpResponse.json({ error: { errors: [{ reason: 'rateLimitExceeded' }] } }, { status: 403 }),
      ),
    )

    await expect(searchShorts('스쿼트', 'test-key')).rejects.toBeInstanceOf(QuotaExceededError)
  })

  it('429 면 QuotaExceededError를 던진다', async () => {
    server.use(http.get(SEARCH, () => HttpResponse.json({}, { status: 429 })))

    await expect(searchShorts('스쿼트', 'test-key')).rejects.toBeInstanceOf(QuotaExceededError)
  })

  it('쿼터와 무관한 403 은 일반 Error로 던진다', async () => {
    server.use(
      http.get(SEARCH, () =>
        HttpResponse.json({ error: { errors: [{ reason: 'forbidden' }] } }, { status: 403 }),
      ),
    )

    const promise = searchShorts('스쿼트', 'test-key')
    await expect(promise).rejects.toThrow(/403/)
    await expect(promise).rejects.not.toBeInstanceOf(QuotaExceededError)
  })
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run tests/unit/youtube.test.ts`
Expected: FAIL — `isQuotaFailure` is not exported. 그리고 rateLimitExceeded·429 테스트가
`QuotaExceededError` 대신 일반 `Error`를 받아 실패한다.

- [ ] **Step 3: 판별 로직 분리와 확장**

`src/lib/youtube.ts`에서 `readJson`의 403 조건을 아래로 교체한다.

```ts
/** Google이 "요청을 줄여라"를 알리는 세 가지 이유. */
const QUOTA_REASONS = ['quotaExceeded', 'rateLimitExceeded', 'userRateLimitExceeded']

/**
 * 쿼터·레이트리밋 소진인지 판별한다.
 * Task 6은 이 신호만 잡아 캐시 폴백으로 전환하고 나머지 오류는 실제 실패로 흘린다.
 * 429는 본문을 보지 않는다 — 429 자체가 레이트리밋이다.
 */
export function isQuotaFailure(status: number, body: string): boolean {
  if (status === 429) return true
  if (status !== 403) return false
  return QUOTA_REASONS.some((reason) => body.includes(reason))
}

async function readJson<T>(response: Response, label: string): Promise<T> {
  if (response.ok) return (await response.json()) as T

  const body = await response.text()
  if (isQuotaFailure(response.status, body)) {
    throw new QuotaExceededError()
  }
  throw new Error(`YouTube ${label} 호출 실패: ${response.status} ${body}`)
}
```

`QuotaExceededError`의 메시지도 레이트리밋을 포함하도록 바꾼다.

```ts
export class QuotaExceededError extends Error {
  constructor() {
    super('YouTube API quota or rate limit exceeded')
    this.name = 'QuotaExceededError'
  }
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인**

Run: `npm test`
Expected: PASS — 52 tests passed (기존 43 + `isQuotaFailure` 6개 + `searchShorts` 3개)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/youtube.ts tests/unit/youtube.test.ts
git commit -m "fix: 레이트리밋(403 rateLimitExceeded, 429)도 쿼터 소진으로 판별

Task 6은 QuotaExceededError만 잡아 캐시 폴백으로 전환한다.
레이트리밋이 일반 Error로 던져지면 우아한 degrade 대신 크래시 화면이 뜬다."
```

---

### Task 6: 검색 오케스트레이션과 API 라우트

**Files:**
- Create: `src/lib/videoSearch.ts`
- Create: `src/app/api/videos/route.ts`
- Test: `tests/unit/videoSearch.test.ts`

**Interfaces:**
- Consumes: `normalizeQuery` (Task 3), `readCache`·`writeCache` (Task 5), `searchShorts`·`QuotaExceededError` (Task 4), `VideoSearchResult` (Task 3)
- Produces: `getVideos(rawQuery: string): Promise<VideoSearchResult>` — 페이지와 API 라우트가 함께 쓴다

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/unit/videoSearch.test.ts`:

```ts
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { clearMemoryCache } from '@/lib/searchCache'
import { getVideos } from '@/lib/videoSearch'

const SEARCH = 'https://www.googleapis.com/youtube/v3/search'
const VIDEOS = 'https://www.googleapis.com/youtube/v3/videos'

const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

beforeEach(() => {
  process.env.YOUTUBE_API_KEY = 'test-key'
  // Supabase를 끊어 순수 조회 경로를 검증한다.
  delete process.env.SUPABASE_URL
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
  // Supabase가 없으면 Task 5b의 메모리 폴백이 동작한다.
  // 비우지 않으면 앞 테스트가 채운 항목을 뒤 테스트가 캐시 히트로 받아
  // YouTube 호출이 일어나지 않고, 쿼터·오류·키 누락 테스트가 모두 무의미해진다.
  clearMemoryCache()
})

function mockYouTube(items: Array<{ id: string; duration: string }>) {
  server.use(
    http.get(SEARCH, () =>
      HttpResponse.json({ items: items.map((item) => ({ id: { videoId: item.id } })) }),
    ),
    http.get(VIDEOS, () =>
      HttpResponse.json({
        items: items.map((item) => ({
          id: item.id,
          snippet: {
            title: `제목 ${item.id}`,
            channelTitle: '헬스톡',
            thumbnails: { high: { url: `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg` } },
          },
          contentDetails: { duration: item.duration },
        })),
      }),
    ),
  )
}

describe('getVideos', () => {
  it('검색어를 정규화해서 결과를 반환한다', async () => {
    mockYouTube([{ id: 'a', duration: 'PT45S' }])

    const result = await getVideos('  스쿼트  ')

    expect(result.query).toBe('스쿼트')
    expect(result.videos.map((v) => v.id)).toEqual(['a'])
    expect(result.fromCache).toBe(false)
    expect(result.quotaExceeded).toBe(false)
  })

  it('빈 검색어는 API를 호출하지 않는다', async () => {
    const result = await getVideos('   ')

    expect(result).toEqual({ query: '', videos: [], fromCache: false, quotaExceeded: false })
  })

  it('쿼터 초과면 quotaExceeded를 표시하고 던지지 않는다', async () => {
    server.use(
      http.get(SEARCH, () =>
        HttpResponse.json({ error: { errors: [{ reason: 'quotaExceeded' }] } }, { status: 403 }),
      ),
    )

    const result = await getVideos('스쿼트')

    expect(result.quotaExceeded).toBe(true)
    expect(result.videos).toEqual([])
  })

  it('쿼터 외의 오류는 그대로 던진다', async () => {
    server.use(http.get(SEARCH, () => HttpResponse.json({}, { status: 500 })))

    await expect(getVideos('스쿼트')).rejects.toThrow(/500/)
  })

  it('API 키가 없으면 던진다', async () => {
    delete process.env.YOUTUBE_API_KEY

    await expect(getVideos('스쿼트')).rejects.toThrow(/YOUTUBE_API_KEY/)
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run tests/unit/videoSearch.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/videoSearch"`

- [ ] **Step 3: 최소 구현 작성**

`src/lib/videoSearch.ts`:

```ts
import { normalizeQuery } from './cacheKey'
import { readCache, writeCache } from './searchCache'
import type { VideoSearchResult } from './types'
import { QuotaExceededError, searchShorts } from './youtube'

/**
 * 캐시 우선 검색.
 * 서버 컴포넌트와 API 라우트가 이 함수를 공유한다.
 * 쿼터가 소진되면 만료된 캐시라도 돌려주고 배너 신호를 켠다.
 */
export async function getVideos(rawQuery: string): Promise<VideoSearchResult> {
  const query = normalizeQuery(rawQuery)
  if (!query) {
    return { query, videos: [], fromCache: false, quotaExceeded: false }
  }

  const cached = await readCache(query)
  if (cached) {
    return { query, videos: cached, fromCache: true, quotaExceeded: false }
  }

  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) throw new Error('YOUTUBE_API_KEY 환경변수가 필요합니다')

  try {
    const videos = await searchShorts(query, apiKey)
    await writeCache(query, videos)
    return { query, videos, fromCache: false, quotaExceeded: false }
  } catch (error) {
    if (!(error instanceof QuotaExceededError)) throw error

    const stale = await readCache(query, { allowStale: true })
    return { query, videos: stale ?? [], fromCache: true, quotaExceeded: true }
  }
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인**

Run: `npx vitest run tests/unit/videoSearch.test.ts`
Expected: PASS — 5 tests passed

- [ ] **Step 5: API 라우트 작성**

`src/app/api/videos/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { getVideos } from '@/lib/videoSearch'

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get('q') ?? ''
  if (!query.trim()) {
    return NextResponse.json({ error: 'q 파라미터가 필요합니다' }, { status: 400 })
  }

  const result = await getVideos(query)
  return NextResponse.json(result)
}
```

- [ ] **Step 6: 빌드와 전체 테스트 확인**

```bash
npm run build
npm test
```

Expected: 빌드 성공, 44 tests passed

- [ ] **Step 7: 커밋**

```bash
git add src/lib/videoSearch.ts src/app/api tests/unit/videoSearch.test.ts
git commit -m "feat: 캐시 우선 검색 오케스트레이션과 /api/videos 라우트 추가"
```

---

### Task 6b: 캐시 히트와 stale 폴백을 실제로 검증

**Files:**
- Modify: `tests/unit/videoSearch.test.ts`
- Modify: `src/lib/videoSearch.ts`

**Interfaces:**
- `getVideos`의 시그니처는 그대로다. 쿼터 경로의 `fromCache` 값만 정직해진다

**왜 필요한가**

Task 6 리뷰가 잡은 두 가지 커버리지 구멍이다.

**1. 캐시 히트 분기를 아무 테스트도 지나가지 않는다.** 5개 테스트가 모두 빈 검색어로
빠지거나, `beforeEach`가 비운 캐시에서 미스를 받거나, 오류로 끝난다. "캐시 우선 검색"의
핵심 승리 조건 — 네트워크를 건너뛰고 캐시를 반환하는 것 — 이 검증되지 않는다.

**2. 쿼터 테스트가 stale 폴백을 증명하지 못한다.** 만료된 캐시를 심어두지 않으므로
`readCache(query, { allowStale: true })`는 이 테스트에서 어차피 `null`을 반환한다.
**폴백 재조회를 아예 생략하고 빈 배열만 반환하는 구현도 똑같이 통과한다.** 이 테스트는
"stale 데이터가 없을 때의 결과 모양"만 확인하지, 폴백이 일어난다는 것을 확인하지 않는다.

리뷰어는 `await writeCache`를 fire-and-forget으로 바꾸자고 제안했으나 **거절한다.**
서버리스에서는 응답을 보낸 뒤 떠 있는 프로미스가 완료된다는 보장이 없다. `await`를 빼면
인스턴스가 얼어붙어 캐시가 영영 기록되지 않을 수 있고, 그러면 캐시의 존재 이유가 사라진다.
지연을 감수하는 쪽이 맞다. 대신 이유를 주석으로 남겨 다음 사람이 같은 제안을 반복하지
않게 한다.

- [ ] **Step 1: 실패하는 테스트 추가**

`tests/unit/videoSearch.test.ts`의 import에 `writeCache`와 `CACHE_TTL_MS`를 추가하고
(`@/lib/searchCache`에서), `vi`를 `vitest`에서 가져온다. 아래 두 테스트를
`describe('getVideos', ...)` 안에 추가한다.

```ts
  it('캐시에 있으면 YouTube를 호출하지 않는다', async () => {
    // MSW 핸들러를 등록하지 않는다.
    // onUnhandledRequest: 'error' 이므로 요청이 나가면 이 테스트가 실패한다.
    const videos = [
      {
        id: 'cached',
        title: '캐시된 스쿼트',
        channelTitle: '헬스톡',
        thumbnailUrl: 'https://i.ytimg.com/vi/cached/hqdefault.jpg',
        durationSeconds: 45,
      },
    ]
    await writeCache('스쿼트', videos)

    const result = await getVideos('스쿼트')

    expect(result).toEqual({
      query: '스쿼트',
      videos,
      fromCache: true,
      quotaExceeded: false,
    })
  })

  it('쿼터 초과면 만료된 캐시라도 꺼내 온다', async () => {
    server.use(
      http.get(SEARCH, () =>
        HttpResponse.json({ error: { errors: [{ reason: 'quotaExceeded' }] } }, { status: 403 }),
      ),
    )
    const videos = [
      {
        id: 'stale',
        title: '오래된 스쿼트',
        channelTitle: '헬스톡',
        thumbnailUrl: 'https://i.ytimg.com/vi/stale/hqdefault.jpg',
        durationSeconds: 50,
      },
    ]
    await writeCache('스쿼트', videos)

    // TTL을 넘긴 시점으로 이동한다. Date만 가짜로 바꿔 MSW의 비동기 처리를 건드리지 않는다.
    const realNow = Date.now()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(realNow + CACHE_TTL_MS + 1)

    try {
      const result = await getVideos('스쿼트')

      // 첫 readCache 는 만료로 null → searchShorts 403 → allowStale 재조회로 살아난다.
      // 폴백 재조회를 생략한 구현이면 videos 가 [] 라 이 단정이 실패한다.
      expect(result.videos).toEqual(videos)
      expect(result.quotaExceeded).toBe(true)
      expect(result.fromCache).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run tests/unit/videoSearch.test.ts`
Expected: 두 테스트 모두 실패한다. 첫 번째는 `writeCache`/`CACHE_TTL_MS` import가 없어
해석 실패, 추가한 뒤에는 통과할 수도 있다 — 그렇다면 **캐시 히트 경로가 원래 맞게
동작한다는 뜻이므로 정상이다.** 두 번째는 현재 구현에서 통과해야 한다. 두 테스트의 목적은
버그를 드러내는 것이 아니라 **이미 맞는 동작에 회귀 방지막을 씌우는 것**이다.

다만 Step 3의 `fromCache` 수정 전에는, stale이 없는 기존 쿼터 테스트가
`fromCache: true`를 기대하고 있으므로 그 테스트는 Step 3 이후 조정이 필요할 수 있다.
실행해서 확인하고 필요한 만큼만 고친다.

- [ ] **Step 3: 쿼터 경로의 fromCache를 정직하게 만들기**

`src/lib/videoSearch.ts`의 쿼터 폴백 반환을 수정한다.

```ts
    const stale = await readCache(query, { allowStale: true })
    // stale 이 없으면 캐시에서 온 것이 아니다. 빈 결과에 "캐시됨"을 붙이면
    // UI가 "저장된 결과를 보여준다"고 잘못 안내하게 된다.
    return { query, videos: stale ?? [], fromCache: stale !== null, quotaExceeded: true }
```

기존 쿼터 테스트(`'쿼터 초과면 quotaExceeded를 표시하고 던지지 않는다'`)가
`fromCache`를 단정하고 있다면 `false`로 맞춘다 — 그 테스트에는 stale 데이터가 없다.

- [ ] **Step 4: await writeCache 의 이유를 주석으로 남기기**

```ts
    // 서버리스에서는 응답을 보낸 뒤 떠 있는 프로미스가 완료된다는 보장이 없다.
    // await 를 빼면 인스턴스가 얼어붙어 캐시가 영영 기록되지 않을 수 있고,
    // 그러면 쿼터를 아끼려던 캐시의 존재 이유가 사라진다. 지연을 감수한다.
    await writeCache(query, videos)
```

- [ ] **Step 5: 전체 확인**

시작 전 `npm test`로 현재 개수를 확인하고 그 값에 **2**를 더한 수를 기대한다.

Run: `npm test`
Expected: PASS — 기준선 + 2. 출력 깨끗.

Run: `npx tsc --noEmit`
Expected: 클린

- [ ] **Step 6: 커밋**

```bash
git add tests/unit/videoSearch.test.ts src/lib/videoSearch.ts
git commit -m "test: 캐시 히트와 stale 폴백을 실제로 검증

캐시 우선 검색의 핵심 승리 조건(네트워크를 건너뛰고 캐시 반환)을 어떤 테스트도
지나가지 않았다. 쿼터 테스트도 만료된 캐시를 심지 않아 폴백 재조회를 생략한
구현이 똑같이 통과했다.

쿼터 경로의 fromCache 가 stale 유무와 무관하게 true 였던 것도 함께 고쳤다."
```

---

### Task 7: 운동 탭 화면

**Files:**
- Create: `src/data/categories.ts`
- Create: `src/components/SearchBar.tsx`
- Create: `src/components/CategoryChips.tsx`
- Create: `src/components/VideoGrid.tsx`
- Create: `src/components/EmptyState.tsx`
- Create: `src/components/QuotaBanner.tsx`
- Create: `src/app/(tabs)/error.tsx`
- Modify: `src/app/(tabs)/page.tsx` (Task 1의 임시 내용을 교체)

**Interfaces:**
- Consumes: `getVideos` (Task 6), `formatDuration` (Task 2), `ShortVideo` (Task 3)
- Produces:
  - `BODY_PARTS: ReadonlyArray<{ id: string; label: string; query: string }>`
  - `POPULAR_EXERCISES: readonly string[]` (20개, Task 10의 시드가 사용)
  - `data-testid="video-card"` — 그리드 카드. E2E가 이 값으로 카드를 센다
  - `data-testid="quota-banner"`, `data-testid="empty-state"`

- [ ] **Step 1: 카테고리 데이터 작성**

`src/data/categories.ts`:

```ts
export const BODY_PARTS = [
  { id: 'chest', label: '가슴', query: '가슴 운동' },
  { id: 'back', label: '등', query: '등 운동' },
  { id: 'shoulder', label: '어깨', query: '어깨 운동' },
  { id: 'legs', label: '하체', query: '하체 운동' },
  { id: 'arms', label: '팔', query: '팔 운동' },
  { id: 'core', label: '코어', query: '코어 운동' },
  { id: 'full', label: '전신', query: '전신 운동' },
] as const

/** 캐시 시드와 추천 검색어에 함께 쓴다. */
export const POPULAR_EXERCISES = [
  '스쿼트',
  '벤치프레스',
  '데드리프트',
  '풀업',
  '랫풀다운',
  '오버헤드프레스',
  '바벨로우',
  '덤벨플라이',
  '레그프레스',
  '런지',
  '플랭크',
  '사이드레터럴레이즈',
  '바이셉컬',
  '트라이셉스익스텐션',
  '힙쓰러스트',
  '레그컬',
  '케이블크로스오버',
  '친업',
  '버피',
  '마운틴클라이머',
] as const
```

- [ ] **Step 2: 검색창 작성**

`src/components/SearchBar.tsx`:

```tsx
/** GET 폼이라 자바스크립트 없이도 동작하고, 검색 상태가 URL에 남는다. */
export default function SearchBar({ defaultValue = '' }: { defaultValue?: string }) {
  return (
    <form action="/" method="get" role="search" className="flex gap-2">
      <input
        type="search"
        name="q"
        defaultValue={defaultValue}
        placeholder="운동 이름을 검색하세요"
        aria-label="운동 이름"
        className="h-12 min-w-0 flex-1 rounded-xl border border-border bg-surface px-4 text-text placeholder:text-muted focus:border-accent focus:outline-none"
      />
      <button
        type="submit"
        className="h-12 shrink-0 rounded-xl bg-accent px-5 font-semibold text-bg"
      >
        검색
      </button>
    </form>
  )
}
```

- [ ] **Step 3: 카테고리 칩 작성**

`src/components/CategoryChips.tsx`:

```tsx
import Link from 'next/link'
import { BODY_PARTS } from '@/data/categories'

export default function CategoryChips() {
  return (
    <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
      {BODY_PARTS.map((part) => (
        <li key={part.id} className="shrink-0">
          <Link
            href={`/?q=${encodeURIComponent(part.query)}`}
            className="inline-flex h-9 items-center rounded-full border border-border bg-surface2 px-4 text-sm text-text"
          >
            {part.label}
          </Link>
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 4: 그리드 작성**

`src/components/VideoGrid.tsx`:

```tsx
import Image from 'next/image'
import Link from 'next/link'
import { formatDuration } from '@/lib/duration'
import type { ShortVideo } from '@/lib/types'

export default function VideoGrid({ query, videos }: { query: string; videos: ShortVideo[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3">
      {videos.map((video, index) => (
        <li key={video.id}>
          <Link
            href={`/feed?q=${encodeURIComponent(query)}&i=${index}`}
            data-testid="video-card"
            className="block"
          >
            <div className="relative aspect-[9/16] overflow-hidden rounded-xl bg-surface2">
              <Image src={video.thumbnailUrl} alt="" fill sizes="50vw" className="object-cover" />
              <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-[11px] text-text">
                {formatDuration(video.durationSeconds)}
              </span>
            </div>
            <p className="mt-1.5 line-clamp-2 text-sm text-text">{video.title}</p>
            <p className="mt-0.5 text-xs text-muted">{video.channelTitle}</p>
          </Link>
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 5: 빈 결과와 쿼터 배너 작성**

`src/components/EmptyState.tsx`:

```tsx
import Link from 'next/link'
import { POPULAR_EXERCISES } from '@/data/categories'

export default function EmptyState({ query }: { query: string }) {
  return (
    <div data-testid="empty-state" className="rounded-xl border border-border bg-surface p-5">
      <p className="text-sm text-text">
        <span className="font-semibold">{query}</span> 에 맞는 쇼츠를 찾지 못했어요.
      </p>
      <p className="mt-1 text-xs text-muted">철자를 확인하거나 아래 운동을 눌러보세요.</p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {POPULAR_EXERCISES.slice(0, 6).map((name) => (
          <li key={name}>
            <Link
              href={`/?q=${encodeURIComponent(name)}`}
              className="inline-flex h-8 items-center rounded-full border border-border bg-surface2 px-3 text-xs text-text"
            >
              {name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

`src/components/QuotaBanner.tsx`:

```tsx
export default function QuotaBanner() {
  return (
    <p
      data-testid="quota-banner"
      className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-xs text-text"
    >
      검색 한도에 걸렸어요. 이미 찾아둔 운동은 계속 볼 수 있습니다.
    </p>
  )
}
```

- [ ] **Step 6: 네트워크 실패 재시도 화면 작성**

`getVideos`가 쿼터 외의 이유로 실패하면 예외가 서버 컴포넌트를 통과한다. 라우트 그룹에 에러 경계를 둬서 앱 전체가 죽는 대신 재시도 버튼을 보여준다.

**`reset`이 아니라 `unstable_retry`를 쓴다.** Next 16.2에서 `reset()`은 에러 경계 상태만 지우고 서버 데이터를 다시 가져오지 않는다. 네트워크 실패에서 회복하려면 재요청이 일어나야 하므로 `reset()`으로는 버튼이 제 일을 못 한다. 번들 문서(`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md`)가 `unstable_retry()`를 권장한다.

`src/app/(tabs)/error.tsx`:

```tsx
'use client'

/**
 * reset() 은 에러 상태만 지우고 서버 데이터를 재요청하지 않는다.
 * 네트워크 실패 회복에는 재요청이 필요하므로 unstable_retry() 를 쓴다.
 */
export default function TabsError({
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  return (
    <div
      data-testid="error-state"
      className="rounded-xl border border-danger/40 bg-danger/10 p-5 text-center"
    >
      <p className="text-sm text-text">영상을 불러오지 못했어요.</p>
      <p className="mt-1 text-xs text-muted">네트워크를 확인한 뒤 다시 시도해 주세요.</p>
      <button
        type="button"
        onClick={() => unstable_retry()}
        className="mt-4 h-10 rounded-xl bg-accent px-5 text-sm font-semibold text-bg"
      >
        다시 시도
      </button>
    </div>
  )
}
```

- [ ] **Step 7: 운동 탭 페이지 작성**

`src/app/(tabs)/page.tsx` 전체를 교체:

```tsx
import CategoryChips from '@/components/CategoryChips'
import EmptyState from '@/components/EmptyState'
import QuotaBanner from '@/components/QuotaBanner'
import SearchBar from '@/components/SearchBar'
import VideoGrid from '@/components/VideoGrid'
import { getVideos } from '@/lib/videoSearch'

export default async function ExercisePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q = '' } = await searchParams
  const result = q.trim() ? await getVideos(q) : null

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">어떤 운동을 볼까요</h1>
      <SearchBar defaultValue={q} />
      <CategoryChips />

      {result?.quotaExceeded ? <QuotaBanner /> : null}

      {result === null ? (
        <p className="pt-6 text-center text-sm text-muted">
          운동 이름을 검색하거나 위 부위를 선택하세요.
        </p>
      ) : result.videos.length === 0 ? (
        <EmptyState query={result.query} />
      ) : (
        <VideoGrid query={result.query} videos={result.videos} />
      )}
    </div>
  )
}
```

- [ ] **Step 8: 빌드가 통과하는지 확인**

```bash
npm run build
```

Expected: 빌드 성공. `/` 가 동적 라우트로 표시된다.

- [ ] **Step 9: 커밋**

```bash
git add src/data src/components "src/app/(tabs)"
git commit -m "feat: 운동 탭 화면 추가 (검색창, 카테고리 칩, 썸네일 그리드)"
```

---

### Task 8: 전면 스와이프 피드

**Files:**
- Create: `src/components/FeedSlide.tsx`
- Create: `src/components/ShortsFeed.tsx`
- Create: `src/components/BackButton.tsx`
- Create: `src/app/feed/page.tsx`

**Interfaces:**
- Consumes: `buildEmbedUrl` (Task 3), `getVideos` (Task 6), `ShortVideo` (Task 3)
- Produces: `/feed?q=<검색어>&i=<인덱스>` 라우트. `data-testid="feed-slide"`, `data-testid="back-button"`

- [ ] **Step 1: 슬라이드 작성**

`src/components/FeedSlide.tsx`:

```tsx
import Image from 'next/image'
import { buildEmbedUrl } from '@/lib/embed'
import type { ShortVideo } from '@/lib/types'

/**
 * active 가 false 면 iframe을 만들지 않는다.
 * 슬라이드 수만큼 iframe을 동시에 띄우면 모바일에서 즉시 버벅인다.
 */
export default function FeedSlide({ video, active }: { video: ShortVideo; active: boolean }) {
  return (
    <div className="relative h-full w-full bg-black">
      {active ? (
        <iframe
          src={buildEmbedUrl(video.id)}
          title={video.title}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 h-full w-full border-0"
        />
      ) : (
        <Image src={video.thumbnailUrl} alt="" fill sizes="100vw" className="object-cover opacity-50" />
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-4 pb-8">
        <p className="line-clamp-2 text-sm font-medium text-text">{video.title}</p>
        <p className="mt-0.5 text-xs text-muted">{video.channelTitle}</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 피드 컨테이너 작성**

`src/components/ShortsFeed.tsx`:

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import FeedSlide from '@/components/FeedSlide'
import type { ShortVideo } from '@/lib/types'

/** 현재 슬라이드 기준 앞뒤 몇 개까지 iframe을 마운트할지. */
const MOUNT_WINDOW = 1

export default function ShortsFeed({
  videos,
  initialIndex,
}: {
  videos: ShortVideo[]
  initialIndex: number
}) {
  const [activeIndex, setActiveIndex] = useState(initialIndex)
  const containerRef = useRef<HTMLDivElement>(null)
  const slideRefs = useRef<Array<HTMLDivElement | null>>([])

  // 그리드에서 누른 영상으로 바로 이동한다.
  useEffect(() => {
    slideRefs.current[initialIndex]?.scrollIntoView({ block: 'start' })
  }, [initialIndex])

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const index = Number((entry.target as HTMLElement).dataset.index)
          if (!Number.isNaN(index)) setActiveIndex(index)
        }
      },
      { root: containerRef.current, threshold: 0.6 },
    )

    for (const slide of slideRefs.current) {
      if (slide) observer.observe(slide)
    }
    return () => observer.disconnect()
  }, [videos.length])

  return (
    <div
      ref={containerRef}
      className="h-dvh snap-y snap-mandatory overflow-y-scroll overscroll-contain"
    >
      {videos.map((video, index) => (
        <div
          key={video.id}
          data-index={index}
          data-testid="feed-slide"
          ref={(element) => {
            slideRefs.current[index] = element
          }}
          className="h-dvh w-full snap-start snap-always"
        >
          <FeedSlide video={video} active={Math.abs(index - activeIndex) <= MOUNT_WINDOW} />
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: 뒤로가기 버튼 작성**

`src/components/BackButton.tsx`:

```tsx
'use client'

import { useRouter } from 'next/navigation'

/**
 * Link 로 그리드로 되돌아가면 히스토리가 쌓여 스크롤 위치가 복원되지 않는다.
 * 실제 뒤로가기를 써야 브라우저가 그리드의 스크롤 위치를 되돌려준다.
 */
export default function BackButton() {
  const router = useRouter()

  return (
    <button
      type="button"
      onClick={() => router.back()}
      data-testid="back-button"
      aria-label="뒤로"
      className="fixed left-3 top-3 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-lg text-text"
    >
      ←
    </button>
  )
}
```

- [ ] **Step 4: 피드 페이지 작성**

`src/app/feed/page.tsx`:

```tsx
import { notFound } from 'next/navigation'
import BackButton from '@/components/BackButton'
import ShortsFeed from '@/components/ShortsFeed'
import { getVideos } from '@/lib/videoSearch'

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; i?: string }>
}) {
  const { q = '', i } = await searchParams
  if (!q.trim()) notFound()

  const result = await getVideos(q)
  if (result.videos.length === 0) notFound()

  const requested = Number(i ?? 0)
  const initialIndex = Number.isFinite(requested)
    ? Math.min(Math.max(Math.trunc(requested), 0), result.videos.length - 1)
    : 0

  return (
    <>
      <BackButton />
      <ShortsFeed videos={result.videos} initialIndex={initialIndex} />
    </>
  )
}
```

- [ ] **Step 5: 빌드와 전체 테스트 확인**

```bash
npm run build
npm test
```

Expected: 빌드 성공, 44 tests passed

- [ ] **Step 6: 커밋**

```bash
git add src/components/FeedSlide.tsx src/components/ShortsFeed.tsx src/components/BackButton.tsx src/app/feed
git commit -m "feat: 전면 세로 스와이프 쇼츠 피드 추가"
```

---

### Task 9: E2E 테스트

**Files:**
- Create: `tests/e2e/mock-youtube.mjs`
- Create: `tests/e2e/search-feed.spec.ts`
- Create: `playwright.config.ts`

**Interfaces:**
- Consumes: Task 7·8의 `data-testid` 값, `YOUTUBE_API_BASE` 환경변수 (Task 4)
- Produces: `npm run test:e2e`

- [ ] **Step 1: 모의 YouTube 서버 작성**

`tests/e2e/mock-youtube.mjs`:

```js
import { createServer } from 'node:http'

const PORT = 4010

// 쇼츠 9개 + 걸러져야 하는 20분 영상 1개.
// 그리드가 화면보다 길어야 스크롤 복원 테스트가 의미를 갖고,
// 슬라이드가 마운트 윈도우(±1)보다 많아야 iframe 개수로 윈도우를 검증할 수 있다.
const CATALOG = [
  { id: 'vid1', title: '스쿼트 기본 자세', channelTitle: '헬스톡', duration: 'PT45S' },
  { id: 'vid2', title: '무릎 안 아픈 스쿼트', channelTitle: '김코치', duration: 'PT58S' },
  { id: 'vid3', title: '하체 루틴 30초', channelTitle: '짐랫', duration: 'PT30S' },
  { id: 'vid4', title: '스쿼트 발 너비', channelTitle: '헬스톡', duration: 'PT52S' },
  { id: 'vid5', title: '스쿼트 호흡법', channelTitle: '김코치', duration: 'PT40S' },
  { id: 'vid6', title: '스쿼트 흔한 실수 3가지', channelTitle: '짐랫', duration: 'PT1M10S' },
  { id: 'vid7', title: '맨몸 스쿼트 100개', channelTitle: '홈트왕', duration: 'PT2M30S' },
  { id: 'vid8', title: '스미스머신 스쿼트', channelTitle: '헬스톡', duration: 'PT1M45S' },
  { id: 'vid9', title: '스쿼트 무게 늘리기', channelTitle: '김코치', duration: 'PT3M' },
  { id: 'vid10', title: '스쿼트 20분 완전 강의', channelTitle: '헬스톡', duration: 'PT20M' },
]

function videoItem(entry) {
  return {
    id: entry.id,
    snippet: {
      title: entry.title,
      channelTitle: entry.channelTitle,
      thumbnails: { high: { url: `https://i.ytimg.com/vi/${entry.id}/hqdefault.jpg` } },
    },
    contentDetails: { duration: entry.duration },
  }
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`)
  const query = url.searchParams.get('q') ?? ''
  res.setHeader('content-type', 'application/json')

  if (query.includes('쿼터초과')) {
    res.statusCode = 403
    res.end(JSON.stringify({ error: { errors: [{ reason: 'quotaExceeded' }] } }))
    return
  }

  if (url.pathname.endsWith('/search')) {
    const items = query.includes('없는운동')
      ? []
      : CATALOG.map((entry) => ({ id: { videoId: entry.id } }))
    res.end(JSON.stringify({ items }))
    return
  }

  if (url.pathname.endsWith('/videos')) {
    const ids = (url.searchParams.get('id') ?? '').split(',')
    res.end(JSON.stringify({ items: CATALOG.filter((e) => ids.includes(e.id)).map(videoItem) }))
    return
  }

  res.statusCode = 404
  res.end('{}')
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`mock youtube listening on ${PORT}`)
})
```

- [ ] **Step 2: Playwright 설정 작성**

`playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test'

const BASE_URL = 'http://127.0.0.1:3000'

export default defineConfig({
  testDir: './tests/e2e',
  use: { baseURL: BASE_URL, ...devices['Pixel 5'] },
  webServer: [
    {
      command: 'node tests/e2e/mock-youtube.mjs',
      port: 4010,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run build && npm run start',
      url: BASE_URL,
      timeout: 180_000,
      reuseExistingServer: !process.env.CI,
      // SUPABASE_* 를 주지 않으므로 캐시 없이 매번 모의 서버를 호출한다.
      env: {
        YOUTUBE_API_KEY: 'test-key',
        YOUTUBE_API_BASE: 'http://127.0.0.1:4010/youtube/v3',
      },
    },
  ],
})
```

- [ ] **Step 3: 실패하는 E2E 테스트 작성**

`tests/e2e/search-feed.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

test('검색하면 쇼츠만 그리드에 나온다', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('운동 이름').fill('스쿼트')
  await page.getByRole('button', { name: '검색' }).click()

  // 모의 서버는 10개를 주지만 20분 영상은 걸러진다.
  await expect(page.getByTestId('video-card')).toHaveCount(9)
  await expect(page.getByText('스쿼트 기본 자세')).toBeVisible()
  await expect(page.getByText('스쿼트 20분 완전 강의')).toHaveCount(0)
})

test('카드를 누르면 전면 피드에서 재생된다', async ({ page }) => {
  await page.goto('/?q=스쿼트')
  await page.getByTestId('video-card').nth(1).click()

  await expect(page).toHaveURL(/\/feed\?q=.*&i=1/)
  await expect(page.getByTestId('feed-slide')).toHaveCount(9)
  // 슬라이드는 9개지만 마운트 윈도우가 ±1이므로 iframe은 3개만 존재한다.
  await expect(page.locator('iframe')).toHaveCount(3)
  await expect(page.locator('iframe').first()).toHaveAttribute('src', /playsinline=1/)
})

test('뒤로가기로 그리드의 스크롤 위치가 복원된다', async ({ page }) => {
  await page.goto('/?q=스쿼트')
  await page.evaluate(() => window.scrollTo(0, 400))
  const before = await page.evaluate(() => window.scrollY)
  expect(before).toBeGreaterThan(0)

  await page.getByTestId('video-card').first().click()
  await expect(page).toHaveURL(/\/feed/)

  await page.getByTestId('back-button').click()
  await expect(page).toHaveURL(/\/\?q=/)
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
})

test('결과가 없으면 추천 검색어를 보여준다', async ({ page }) => {
  await page.goto('/?q=없는운동')

  await expect(page.getByTestId('empty-state')).toBeVisible()
  await expect(page.getByRole('link', { name: '스쿼트' })).toBeVisible()
})

test('쿼터가 초과되면 배너를 보여주고 화면은 유지된다', async ({ page }) => {
  await page.goto('/?q=쿼터초과')

  await expect(page.getByTestId('quota-banner')).toBeVisible()
  await expect(page.getByLabel('운동 이름')).toBeVisible()
})
```

- [ ] **Step 4: 테스트 실행**

Run: `npm run test:e2e`
Expected: 5 tests passed

실패하면 다음을 순서대로 확인한다.
- 모의 서버가 4010에서 응답하는지: `curl "http://127.0.0.1:4010/youtube/v3/search?q=스쿼트"`
- `data-testid` 값이 Task 7·8의 컴포넌트와 일치하는지
- iframe이 3개가 아니라 9개면 `ShortsFeed`의 `MOUNT_WINDOW` 조건이 잘못된 것이다
- 스크롤 복원이 실패하면 그리드 높이가 부족해 스크롤이 안 생긴 것이다. `window.scrollY`가 0이면 모의 카탈로그 항목을 더 늘린다.

- [ ] **Step 5: 커밋**

```bash
git add tests/e2e playwright.config.ts
git commit -m "test: 검색부터 피드 재생까지 E2E 테스트 추가"
```

---

### Task 10: 인기 운동 캐시 시드와 배포

**Files:**
- Create: `scripts/seed-cache.ts`
- Modify: `package.json` (`seed` 스크립트 추가)
- Create: `README.md`

**Interfaces:**
- Consumes: `POPULAR_EXERCISES` (Task 7), `getVideos` (Task 6)
- Produces: `npm run seed`

- [ ] **Step 1: 시드 스크립트 작성**

`scripts/seed-cache.ts`:

```ts
import { POPULAR_EXERCISES } from '../src/data/categories'
import { getVideos } from '../src/lib/videoSearch'

/**
 * 인기 운동을 미리 캐시에 채운다.
 * 검색 1회는 101 units 이므로 20개는 약 2,020 units. 일일 10,000 안에 들어간다.
 * 쿼터가 소진되면 즉시 멈춘다. 남은 항목은 다음 날 다시 실행한다.
 */
async function main() {
  for (const exercise of POPULAR_EXERCISES) {
    try {
      const result = await getVideos(exercise)
      if (result.quotaExceeded) {
        console.error(`쿼터 소진. ${exercise} 이후는 건너뜁니다.`)
        process.exitCode = 1
        return
      }
      console.log(`${exercise}: ${result.videos.length}개 ${result.fromCache ? '(캐시)' : '(신규)'}`)
    } catch (error) {
      console.error(`${exercise} 실패:`, error instanceof Error ? error.message : error)
      process.exitCode = 1
      return
    }
  }
  console.log('시드 완료')
}

void main()
```

- [ ] **Step 2: 스크립트 등록**

`package.json`의 `scripts`에 추가:

```json
"seed": "tsx --env-file=.env.local scripts/seed-cache.ts"
```

- [ ] **Step 3: README 작성**

`README.md`:

````markdown
# 헬스 쇼츠

운동 이름을 검색하면 관련 쇼츠를 웹 내부에서 바로 재생하는 서비스.

설계 문서: `docs/superpowers/specs/2026-07-25-health-shorts-gymwear-design.md`

## 준비

1. `.env.local.example` 을 `.env.local` 로 복사한다.
2. [Google Cloud Console](https://console.cloud.google.com/)에서 YouTube Data API v3를 켜고 API 키를 발급해 `YOUTUBE_API_KEY` 에 넣는다.
3. Supabase 프로젝트를 만들고 SQL Editor에서 `supabase/migrations/0001_search_cache.sql` 을 실행한다.
4. Supabase 프로젝트 설정에서 URL과 `service_role` 키를 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` 에 넣는다.

`SUPABASE_*` 를 비워두면 캐시 없이 동작한다. 다만 검색마다 쿼터를 쓰므로 개발 중에는 채워두는 편이 좋다.

## 실행

```bash
npm run dev        # 개발 서버
npm test           # 단위 테스트
npm run test:e2e   # E2E (모의 YouTube 서버를 자동으로 띄운다)
npm run seed       # 인기 운동 20개 캐시 시드
```

## 쿼터 주의

YouTube Data API 일일 무료 쿼터는 10,000 units다. 검색 1회에 101 units가 들어가므로 **하루 약 99회**가 상한이다. 캐시가 있으면 같은 검색어는 7일간 쿼터를 쓰지 않는다.

## 배포

Vercel에 GitHub 저장소를 연결하고 환경변수 `YOUTUBE_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` 를 등록한다. `YOUTUBE_API_BASE` 는 설정하지 않는다 (테스트 전용).
````

- [ ] **Step 4: 시드가 동작하는지 확인**

`.env.local` 에 실제 키를 채운 뒤:

```bash
npm run seed
```

Expected: `스쿼트: 12개 (신규)` 같은 줄이 20개, 마지막에 `시드 완료`

실제 키가 없으면 이 단계를 건너뛰고 Step 5로 간다. 배포 후 Vercel 환경에서 실행한다.

- [ ] **Step 5: 전체 검증**

```bash
npm test
npm run test:e2e
npm run build
npx tsc --noEmit
npm run lint
```

`next lint`는 Next 16에서 제거됐다. `create-next-app`이 만든 `lint` 스크립트(ESLint 직접 호출)를 쓴다.

Expected: 모두 통과

- [ ] **Step 6: 커밋과 푸시**

```bash
git add scripts package.json README.md
git commit -m "feat: 인기 운동 캐시 시드 스크립트와 실행 문서 추가"
git push -u origin main
```

- [ ] **Step 7: Vercel 배포**

1. [vercel.com](https://vercel.com)에서 `ZIZONJIHUN/HEALTH` 저장소를 import
2. 환경변수 `YOUTUBE_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` 등록
3. 배포 후 폰에서 접속해 검색과 스와이프 재생을 확인

확인 항목:
- [ ] 검색하면 세로 썸네일 그리드가 나온다
- [ ] 썸네일을 누르면 전체화면으로 재생된다 (음소거 상태로 시작)
- [ ] 아래로 스와이프하면 다음 영상으로 넘어간다
- [ ] 뒤로가기로 그리드의 같은 위치로 돌아온다
- [ ] 같은 검색어를 다시 검색하면 즉시 나온다 (캐시)

---

## 단계 1 완료 기준

| 항목 | 확인 방법 |
|---|---|
| 운동 이름 검색이 동작한다 | E2E `검색하면 쇼츠만 그리드에 나온다` |
| 180초 넘는 영상이 걸러진다 | 단위 `filterShorts`, E2E 동일 테스트 |
| 웹 내부에서 재생된다 (외부 이동 없음) | E2E `카드를 누르면 전면 피드에서 재생된다` |
| 세로 스와이프로 연속 재생된다 | 배포 후 실기기 확인 |
| 뒤로가기로 위치가 복원된다 | E2E `뒤로가기로 그리드의 스크롤 위치가 복원된다` |
| 쿼터 초과 시 앱이 죽지 않는다 | E2E `쿼터가 초과되면 배너를 보여주고 화면은 유지된다` |
| 결과 0개 안내가 나온다 | E2E `결과가 없으면 추천 검색어를 보여준다` |
| 캐시가 쿼터를 아낀다 | 같은 검색어 2회 실행 시 `fromCache: true` |
| API 키가 클라이언트에 노출되지 않는다 | `npm run build` 후 `grep -r "YOUTUBE_API_KEY" .next/static` 결과 없음 |
| 다크 팔레트가 적용된다 | 배포 화면 육안 확인 |

## 이 계획에서 의도적으로 뺀 것

**`youtube.com/shorts/{id}` 리다이렉트로 세로 영상 판별** — 설계 문서 5절이 "있으면 좋은 보정 단계"로 규정한 항목이다. 영상 개수만큼 HTTP 요청이 추가되고 비공식 동작이라 언제든 막힌다. 길이 기준(180초)만으로 실사용 품질이 나오는지 배포 후 확인하고, 가로 영상이 눈에 거슬리는 수준이면 그때 추가한다.

**개별 영상의 임베드 실패 감지와 자동 스킵** — 설계 문서 8절에 있으나 이 계획에는 없다. 부모 페이지는 iframe 내부의 재생 실패를 알 수 없고, 알려면 YouTube IFrame Player API를 붙여 `onError` 콜백을 받아야 한다. 그러면 재생 계층 전체를 다시 설계해야 한다. 대신 `search.list`에 `videoEmbeddable=true`를 넘겨 임베드 금지 영상을 **애초에 결과에서 제외**한다. 실기기에서 재생 안 되는 영상이 실제로 나오면 그때 IFrame Player API 전환을 별도 작업으로 다룬다.

## 단계 2로 넘어갈 때 남는 일

- `BottomTabBar`의 `TABS`에 의류 탭 추가
- `search_cache` 외 `brands`, `products` 테이블과 RLS
- 설계 문서 6·7절의 의류 카탈로그와 관리자 화면
