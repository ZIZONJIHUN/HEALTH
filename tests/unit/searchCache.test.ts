import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { CACHE_TTL_MS, clearMemoryCache, isCacheFresh, readCache, writeCache } from '@/lib/searchCache'
import type { ShortVideo } from '@/lib/types'

const NOW = new Date('2026-07-25T00:00:00.000Z').getTime()

function daysAgo(days: number): string {
  return new Date(NOW - days * 24 * 60 * 60 * 1000).toISOString()
}

const SUPABASE_URL = 'http://supabase.test'
const CACHE_ENDPOINT = `${SUPABASE_URL}/rest/v1/search_cache`

const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

/** 캐시에 저장되는 모양. 대부분의 테스트는 1페이지·다음 없음이면 충분하다. */
function page(videos: ShortVideo[], nextPageToken: string | null = null, pages = 1) {
  return { videos, nextPageToken, pages }
}

function sampleVideos(): ShortVideo[] {
  return [
    {
      id: 'a',
      title: '스쿼트 기본',
      channelTitle: '헬스톡',
      thumbnailUrl: 'https://i.ytimg.com/vi/a/hqdefault.jpg',
      durationSeconds: 45,
    },
  ]
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
  const saved = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY }

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    clearMemoryCache()
  })

  afterEach(() => {
    if (saved.url) process.env.NEXT_PUBLIC_SUPABASE_URL = saved.url
    if (saved.key) process.env.SUPABASE_SERVICE_ROLE_KEY = saved.key
  })

  it('쓰지 않은 검색어는 null을 반환한다', async () => {
    await expect(readCache('스쿼트')).resolves.toBeNull()
  })

  it('쓰기는 조용히 성공한다', async () => {
    await expect(writeCache('스쿼트', page([]))).resolves.toBeUndefined()
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

    await writeCache('스쿼트', page(videos))

    await expect(readCache('스쿼트')).resolves.toEqual(page(videos))
  })

  it('정규화된 검색어를 키로 쓴다', async () => {
    await writeCache('  스쿼트  ', page([]))

    await expect(readCache('스쿼트')).resolves.toEqual(page([]))
  })

  it('TTL이 지난 메모리 항목은 null을 반환한다', async () => {
    await writeCache('스쿼트', page([]))
    const later = Date.now() + CACHE_TTL_MS + 1

    await expect(readCache('스쿼트', { now: later })).resolves.toBeNull()
  })

  it('allowStale이면 TTL이 지난 메모리 항목도 반환한다', async () => {
    await writeCache('스쿼트', page([]))
    const later = Date.now() + CACHE_TTL_MS + 1

    await expect(readCache('스쿼트', { allowStale: true, now: later })).resolves.toEqual(page([]))
  })
})

describe('Supabase 호출이 실패할 때', () => {
  const saved = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY }

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
    clearMemoryCache()
    // PostgREST 오류 응답(4xx/5xx)으로 실패를 시뮬레이션한다.
    // HttpResponse.error()(연결 자체 실패)를 쓰면 postgrest-js가 GET/HEAD/OPTIONS에 대해
    // 지수 백오프 재시도(1s+2s+4s ≈ 7s)를 실행해 이 테스트가 다시 느려진다 — 이게 바로
    // Task 5c의 7초 테스트가 실제로 걸린 이유였다. 500 응답은 재시도 대상 상태 코드
    // ([520, 503])가 아니므로 즉시 실패해 재시도를 유발하지 않는다.
    server.use(
      http.all(CACHE_ENDPOINT, () =>
        HttpResponse.json(
          { message: 'relation "search_cache" does not exist', code: '42P01', details: null, hint: null },
          { status: 500 },
        ),
      ),
    )
  })

  afterEach(() => {
    if (saved.url) process.env.NEXT_PUBLIC_SUPABASE_URL = saved.url
    else delete process.env.NEXT_PUBLIC_SUPABASE_URL
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

    await expect(writeCache('스쿼트', page([]))).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalled()
  })
})

describe('Supabase가 정상일 때', () => {
  const saved = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY }

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
    clearMemoryCache()
  })

  afterEach(() => {
    if (saved.url) process.env.NEXT_PUBLIC_SUPABASE_URL = saved.url
    else delete process.env.NEXT_PUBLIC_SUPABASE_URL
    if (saved.key) process.env.SUPABASE_SERVICE_ROLE_KEY = saved.key
    else delete process.env.SUPABASE_SERVICE_ROLE_KEY
    vi.restoreAllMocks()
  })

  it('읽기가 저장된 결과를 반환한다', async () => {
    const videos = sampleVideos()
    server.use(
      http.get(CACHE_ENDPOINT, () =>
        // PostgREST는 select 결과를 배열로 돌려준다. maybeSingle()은 클라이언트 쪽에서
        // 그 배열을 풀어 단일 행(또는 null)으로 만든다.
        HttpResponse.json([{ payload: videos, created_at: daysAgo(0) }]),
      ),
    )

    // now를 명시해 실제 벽시계 시각과 무관하게 TTL 판정을 고정한다.
    await expect(readCache('스쿼트', { now: NOW })).resolves.toEqual(page(videos))
  })

  it('올바른 테이블과 쿼리로 요청한다', async () => {
    let capturedUrl: URL | undefined
    server.use(
      http.get(CACHE_ENDPOINT, ({ request }) => {
        capturedUrl = new URL(request.url)
        return HttpResponse.json([])
      }),
    )

    await readCache('  스쿼트  ')

    expect(capturedUrl?.pathname).toBe('/rest/v1/search_cache')
    expect(capturedUrl?.searchParams.get('select')).toBe('payload,created_at')
    expect(capturedUrl?.searchParams.get('query_key')).toBe('eq.스쿼트')
  })

  it('TTL이 지난 행은 null을 반환한다', async () => {
    const videos = sampleVideos()
    server.use(
      http.get(CACHE_ENDPOINT, () => HttpResponse.json([{ payload: videos, created_at: daysAgo(8) }])),
    )

    await expect(readCache('스쿼트', { now: NOW })).resolves.toBeNull()
    await expect(readCache('스쿼트', { allowStale: true, now: NOW })).resolves.toEqual(page(videos))
  })

  it('쓰기가 올바른 본문을 보낸다', async () => {
    const videos = sampleVideos()
    let capturedBody: { query_key?: string; payload?: unknown } | undefined
    server.use(
      http.post(CACHE_ENDPOINT, async ({ request }) => {
        capturedBody = (await request.json()) as { query_key?: string; payload?: unknown }
        return HttpResponse.json([])
      }),
    )

    await writeCache('  스쿼트  ', page(videos))

    expect(capturedBody?.query_key).toBe('스쿼트')
    // 영상만이 아니라 다음 페이지 토큰까지 저장해야 "더 보기"를 이어갈 수 있다.
    expect(capturedBody?.payload).toEqual({ videos, nextPageToken: null, pages: 1 })
  })

  it('예전 모양(배열)으로 저장된 행도 읽는다', async () => {
    const videos = sampleVideos()
    server.use(
      // 페이지 이어받기 전에는 payload 가 그냥 ShortVideo[] 였다. 이미 들어 있는 행을
      // 버리면 다시 채우는 데 행당 101 units 가 든다.
      http.get(CACHE_ENDPOINT, () => HttpResponse.json([{ payload: videos, created_at: daysAgo(0) }])),
    )

    const result = await readCache('스쿼트', { now: NOW })

    expect(result?.videos).toEqual(videos)
    // 토큰이 없으니 그 행은 TTL 이 끝날 때까지 "더 보기"가 뜨지 않는다.
    expect(result?.nextPageToken).toBeNull()
    expect(result?.pages).toBe(1)
  })

  it('적중분을 메모리에 채워 같은 검색어를 다시 왕복하지 않는다', async () => {
    const videos = sampleVideos()
    let reads = 0
    server.use(
      http.get(CACHE_ENDPOINT, () => {
        reads += 1
        return HttpResponse.json([{ payload: videos, created_at: daysAgo(0) }])
      }),
    )

    await expect(readCache('스쿼트', { now: NOW })).resolves.toEqual(page(videos))
    await expect(readCache('스쿼트', { now: NOW })).resolves.toEqual(page(videos))

    // 7일 동안 변하지 않는 데이터다. 요청마다 Supabase 를 왕복할 이유가 없다.
    expect(reads).toBe(1)
  })

  it('메모리에 채울 때 행의 생성 시각을 그대로 쓴다', async () => {
    const videos = sampleVideos()
    server.use(
      http.get(CACHE_ENDPOINT, () =>
        HttpResponse.json([{ payload: videos, created_at: daysAgo(6) }]),
      ),
    )

    // 6일 된 행을 읽어 메모리에 넣는다.
    await expect(readCache('스쿼트', { now: NOW })).resolves.toEqual(page(videos))

    // Date.now() 로 찍었다면 여기서도 신선하다고 답해 실질 TTL 이 13일이 된다.
    const twoDaysLater = NOW + 2 * 24 * 60 * 60 * 1000
    await expect(readCache('스쿼트', { now: twoDaysLater })).resolves.toBeNull()
  })

  it('Supabase가 죽어도 메모리에 남은 것으로 답한다', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const videos = sampleVideos()

    server.use(
      http.get(CACHE_ENDPOINT, () =>
        HttpResponse.json([{ payload: videos, created_at: daysAgo(0) }]),
      ),
    )
    await readCache('스쿼트', { now: NOW })

    // 이제 Supabase 가 죽는다.
    server.use(
      http.all(CACHE_ENDPOINT, () =>
        HttpResponse.json({ message: 'down', code: '500' }, { status: 500 }),
      ),
    )

    // 예전에는 Supabase 가 '설정돼 있으면' 메모리를 아예 보지 않아서, 장애 중에
    // 캐시도 없고 매 요청이 느린 가장 나쁜 조합이 됐다.
    // 지금은 메모리를 먼저 보므로 죽은 Supabase 에 말을 걸지도 않는다.
    await expect(readCache('스쿼트', { now: NOW })).resolves.toEqual(page(videos))
  })

  it('쓰기 실패 구간에도 같은 검색어가 쿼터를 다시 태우지 않는다', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const videos = sampleVideos()
    server.use(
      http.post(CACHE_ENDPOINT, () =>
        HttpResponse.json({ message: 'down', code: '500' }, { status: 500 }),
      ),
      http.get(CACHE_ENDPOINT, () => HttpResponse.json([])),
    )

    await writeCache('스쿼트', page(videos))

    // Supabase 쓰기가 실패해도 메모리에는 남아야 한다. 이것이 writeCache 의 목적이다.
    await expect(readCache('스쿼트')).resolves.toEqual(page(videos))
  })

  it('메모리 보관 수에 상한이 있다', async () => {
    server.use(http.get(CACHE_ENDPOINT, () => HttpResponse.json([])))
    for (let i = 0; i < 260; i += 1) await writeCache(`운동${i}`, page([]))

    // 상한이 없으면 오래 떠 있는 프로세스에서 Map 이 계속 자란다.
    await expect(readCache('운동0')).resolves.toBeNull()
    await expect(readCache('운동259')).resolves.toEqual(page([]))
  })

  it('행이 없으면 null을 반환하고 경고하지 않는다', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    server.use(http.get(CACHE_ENDPOINT, () => HttpResponse.json([])))

    await expect(readCache('없는운동')).resolves.toBeNull()

    expect(warn).not.toHaveBeenCalled()
  })
})
