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
