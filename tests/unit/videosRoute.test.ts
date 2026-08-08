import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { GET } from '@/app/api/videos/route'
import { clearMemoryCache } from '@/lib/searchCache'

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
  // 비우지 않으면 앞 테스트가 채운 항목을 뒤 테스트가 캐시 히트로 받아
  // YouTube 호출이 일어나지 않는 조용한 통과가 생긴다.
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

describe('GET /api/videos', () => {
  it('q 파라미터가 없으면 400을 반환한다', async () => {
    const response = await GET(new Request('http://localhost/api/videos'))

    expect(response.status).toBe(400)
  })

  it('q 파라미터가 빈 문자열이면 400을 반환한다', async () => {
    const response = await GET(new Request('http://localhost/api/videos?q=%20%20'))

    expect(response.status).toBe(400)
  })

  it('유효한 검색어면 200과 VideoSearchResult 형태를 반환한다', async () => {
    mockYouTube([{ id: 'a', duration: 'PT45S' }])

    const response = await GET(new Request('http://localhost/api/videos?q=스쿼트'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      query: '스쿼트',
      videos: [
        {
          id: 'a',
          title: '제목 a',
          channelTitle: '헬스톡',
          thumbnailUrl: 'https://i.ytimg.com/vi/a/hqdefault.jpg',
          durationSeconds: 45,
        },
      ],
      fromCache: false,
      quotaExceeded: false,
    })
  })
})
