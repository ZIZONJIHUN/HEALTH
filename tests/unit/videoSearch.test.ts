import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { consumeApiBudget, DAILY_CALL_LIMIT, resetApiBudgetForTest } from '@/lib/apiBudget'
import { MAX_QUERY_LENGTH } from '@/lib/cacheKey'
import { CACHE_TTL_MS, clearMemoryCache, writeCache } from '@/lib/searchCache'
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
  resetApiBudgetForTest()
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

  it('상한을 넘는 검색어는 API를 호출하지 않는다', async () => {
    // MSW 핸들러를 등록하지 않는다. onUnhandledRequest: 'error' 라서 YouTube 로
    // 요청이 나가면 이 테스트가 실패한다 — 이것이 쿼터 소각 방어의 핵심 단정이다.
    const result = await getVideos('가'.repeat(MAX_QUERY_LENGTH + 1))

    expect(result.videos).toEqual([])
    expect(result.quotaExceeded).toBe(false)
  })

  it('상한을 넘는 검색어를 화면에 그대로 돌려주지 않는다', async () => {
    // EmptyState 가 result.query 를 그린다. 자르지 않으면 쿼터는 막았는데
    // 장문 문자열이 그대로 HTML 로 나간다.
    const result = await getVideos('가'.repeat(5000))

    expect(result.query.length).toBe(MAX_QUERY_LENGTH)
  })

  it('일일 호출 예산을 넘으면 쿼터 초과로 처리한다', async () => {
    for (let i = 0; i < DAILY_CALL_LIMIT; i += 1) {
      expect(await consumeApiBudget()).toBe(true)
    }

    // 여기서도 핸들러를 등록하지 않는다. 예산이 막지 못하면 요청이 나가 실패한다.
    const result = await getVideos('스쿼트')

    expect(result.quotaExceeded).toBe(true)
    expect(result.videos).toEqual([])
  })

  it('예산이 소진돼도 캐시된 검색어는 계속 보인다', async () => {
    const videos = [
      {
        id: 'saved',
        title: '저장된 스쿼트',
        channelTitle: '헬스톡',
        thumbnailUrl: 'https://i.ytimg.com/vi/saved/hqdefault.jpg',
        durationSeconds: 40,
      },
    ]
    await writeCache('스쿼트', videos)
    for (let i = 0; i < DAILY_CALL_LIMIT; i += 1) await consumeApiBudget()

    const result = await getVideos('스쿼트')

    // 캐시 적중은 예산을 소비하지 않으므로 배너도 뜨지 않는다.
    expect(result.videos).toEqual(videos)
    expect(result.fromCache).toBe(true)
    expect(result.quotaExceeded).toBe(false)
  })

  it('같은 검색어 동시 요청은 YouTube를 한 번만 부른다', async () => {
    let searchCalls = 0
    server.use(
      http.get(SEARCH, () => {
        searchCalls += 1
        return HttpResponse.json({ items: [{ id: { videoId: 'a' } }] })
      }),
      http.get(VIDEOS, () =>
        HttpResponse.json({
          items: [
            {
              id: 'a',
              snippet: {
                title: '제목 a',
                channelTitle: '헬스톡',
                thumbnails: { high: { url: 'https://i.ytimg.com/vi/a/hqdefault.jpg' } },
              },
              contentDetails: { duration: 'PT40S' },
            },
          ],
        }),
      ),
    )

    const [first, second, third] = await Promise.all([
      getVideos('스쿼트'),
      getVideos('스쿼트'),
      getVideos('스쿼트'),
    ])

    // 합류하지 않으면 3 × 101 units 다. 인기 검색어가 만료되는 순간이 정확히 이 상황이다.
    expect(searchCalls).toBe(1)
    expect(first).toBe(second)
    expect(second).toBe(third)
  })

  it('요청이 끝나면 합류 맵을 비워 다음 검색이 새로 돈다', async () => {
    mockYouTube([{ id: 'a', duration: 'PT30S' }])
    await getVideos('스쿼트')
    clearMemoryCache()

    // 맵을 비우지 않으면 여기서 앞 요청의 결과가 그대로 돌아온다.
    mockYouTube([{ id: 'b', duration: 'PT30S' }])
    const result = await getVideos('스쿼트')

    expect(result.videos.map((v) => v.id)).toEqual(['b'])
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
})
