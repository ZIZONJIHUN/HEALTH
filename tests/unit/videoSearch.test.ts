import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { consumeApiBudget, DAILY_CALL_LIMIT, resetApiBudgetForTest } from '@/lib/apiBudget'
import { MAX_QUERY_LENGTH } from '@/lib/cacheKey'
import { CACHE_TTL_MS, clearMemoryCache, writeCache } from '@/lib/searchCache'
import { getVideos, MAX_PAGES } from '@/lib/videoSearch'

const SEARCH = 'https://www.googleapis.com/youtube/v3/search'
const VIDEOS = 'https://www.googleapis.com/youtube/v3/videos'

const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

beforeEach(() => {
  process.env.YOUTUBE_API_KEY = 'test-key'
  // Supabase를 끊어 순수 조회 경로를 검증한다.
  delete process.env.NEXT_PUBLIC_SUPABASE_URL
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
  // Supabase가 없으면 Task 5b의 메모리 폴백이 동작한다.
  // 비우지 않으면 앞 테스트가 채운 항목을 뒤 테스트가 캐시 히트로 받아
  // YouTube 호출이 일어나지 않고, 쿼터·오류·키 누락 테스트가 모두 무의미해진다.
  clearMemoryCache()
  resetApiBudgetForTest()
})

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

function mockYouTube(items: Array<{ id: string; duration: string }>, nextPageToken?: string) {
  server.use(
    http.get(SEARCH, () =>
      HttpResponse.json({
        items: items.map((item) => ({ id: { videoId: item.id } })),
        ...(nextPageToken ? { nextPageToken } : {}),
      }),
    ),
    http.get(VIDEOS, () =>
      HttpResponse.json({ items: items.map((item) => videoItem(item.id, item.duration)) }),
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

    expect(result).toEqual({
      query: '',
      videos: [],
      fromCache: false,
      quotaExceeded: false,
      hasMore: false,
      pages: 0,
    })
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
    await writeCache('스쿼트', { videos, nextPageToken: null, pages: 1 })
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

  it('다음 페이지가 있으면 hasMore 를 켠다', async () => {
    mockYouTube([{ id: 'a', duration: 'PT30S' }], 'TOKEN2')

    const result = await getVideos('스쿼트')

    expect(result.hasMore).toBe(true)
    expect(result.pages).toBe(1)
  })

  it('페이지를 더 요청하면 이어붙인다', async () => {
    const tokens: Array<string | null> = []
    server.use(
      http.get(SEARCH, ({ request }) => {
        const token = new URL(request.url).searchParams.get('pageToken')
        tokens.push(token)
        return HttpResponse.json({
          items: [{ id: { videoId: token ? 'b' : 'a' } }],
          ...(token ? {} : { nextPageToken: 'TOKEN2' }),
        })
      }),
      http.get(VIDEOS, ({ request }) => {
        const id = new URL(request.url).searchParams.get('id') ?? ''
        return HttpResponse.json({ items: [videoItem(id, 'PT30S')] })
      }),
    )

    const result = await getVideos('스쿼트', 2)

    // 1페이지는 토큰 없이, 2페이지는 1페이지가 준 토큰으로.
    expect(tokens).toEqual([null, 'TOKEN2'])
    expect(result.videos.map((v) => v.id)).toEqual(['a', 'b'])
    expect(result.pages).toBe(2)
    expect(result.hasMore).toBe(false)
  })

  it('이미 받아둔 페이지는 다시 부르지 않는다', async () => {
    let searchCalls = 0
    server.use(
      http.get(SEARCH, ({ request }) => {
        searchCalls += 1
        const token = new URL(request.url).searchParams.get('pageToken')
        return HttpResponse.json({
          items: [{ id: { videoId: token ? 'b' : 'a' } }],
          ...(token ? {} : { nextPageToken: 'TOKEN2' }),
        })
      }),
      http.get(VIDEOS, ({ request }) => {
        const id = new URL(request.url).searchParams.get('id') ?? ''
        return HttpResponse.json({ items: [videoItem(id, 'PT30S')] })
      }),
    )

    await getVideos('스쿼트', 2)
    const again = await getVideos('스쿼트', 2)

    expect(searchCalls).toBe(2) // 1페이지 + 2페이지, 그게 전부다
    expect(again.fromCache).toBe(true)
    expect(again.videos).toHaveLength(2)
  })

  it('페이지 수에 상한이 있다', async () => {
    let searchCalls = 0
    server.use(
      http.get(SEARCH, () => {
        searchCalls += 1
        return HttpResponse.json({
          items: [{ id: { videoId: `v${searchCalls}` } }],
          nextPageToken: `TOKEN${searchCalls + 1}`,
        })
      }),
      http.get(VIDEOS, ({ request }) => {
        const id = new URL(request.url).searchParams.get('id') ?? ''
        return HttpResponse.json({ items: [videoItem(id, 'PT30S')] })
      }),
    )

    // 상한이 없으면 `?pages=999` 하나로 하루치 쿼터가 날아간다.
    const result = await getVideos('스쿼트', 999)

    expect(searchCalls).toBe(MAX_PAGES)
    expect(result.pages).toBe(MAX_PAGES)
    // 상한에 닿았으면 더 받을 수 없으니 "더 보기"도 뜨면 안 된다.
    expect(result.hasMore).toBe(false)
  })

  it('이상한 pages 값은 1로 흡수한다', async () => {
    mockYouTube([{ id: 'a', duration: 'PT30S' }])

    for (const pages of [0, -5, Number.NaN]) {
      clearMemoryCache()
      const result = await getVideos('스쿼트', pages)
      expect(result.pages).toBe(1)
    }
  })

  it('페이지 경계에서 겹치는 영상은 한 번만 넣는다', async () => {
    server.use(
      http.get(SEARCH, ({ request }) => {
        const token = new URL(request.url).searchParams.get('pageToken')
        return HttpResponse.json({
          items: [{ id: { videoId: 'a' } }],
          ...(token ? {} : { nextPageToken: 'TOKEN2' }),
        })
      }),
      http.get(VIDEOS, () => HttpResponse.json({ items: [videoItem('a', 'PT30S')] })),
    )

    const result = await getVideos('스쿼트', 2)

    // 같은 영상이 그리드에 두 번 뜨면 안 된다.
    expect(result.videos.map((v) => v.id)).toEqual(['a'])
  })

  it('2페이지에서 예산이 끊겨도 1페이지는 지킨다', async () => {
    server.use(
      http.get(SEARCH, ({ request }) => {
        const token = new URL(request.url).searchParams.get('pageToken')
        return HttpResponse.json({
          items: [{ id: { videoId: token ? 'b' : 'a' } }],
          nextPageToken: 'TOKEN2',
        })
      }),
      http.get(VIDEOS, ({ request }) => {
        const id = new URL(request.url).searchParams.get('id') ?? ''
        return HttpResponse.json({ items: [videoItem(id, 'PT30S')] })
      }),
    )

    // 예산을 딱 한 번만 남겨 둔다.
    for (let i = 0; i < DAILY_CALL_LIMIT - 1; i += 1) await consumeApiBudget()

    const result = await getVideos('스쿼트', 2)

    // 2페이지를 못 받았다고 이미 받은 1페이지까지 버릴 이유가 없다.
    expect(result.videos.map((v) => v.id)).toEqual(['a'])
    expect(result.quotaExceeded).toBe(true)
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
    await writeCache('스쿼트', { videos, nextPageToken: null, pages: 1 })

    const result = await getVideos('스쿼트')

    expect(result).toEqual({
      query: '스쿼트',
      videos,
      fromCache: true,
      quotaExceeded: false,
      hasMore: false,
      pages: 1,
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
    await writeCache('스쿼트', { videos, nextPageToken: null, pages: 1 })

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
