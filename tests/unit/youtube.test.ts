import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { QuotaExceededError, isQuotaFailure, searchShorts } from '@/lib/youtube'

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

    expect(result.videos.map((v) => v.id)).toEqual(['a', 'b'])
    expect(result.videos[0]).toEqual({
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
    // search.list 는 몇 개를 요청하든 100 units 다. 50 미만을 요청하면
    // 낸 값의 일부만 받는 것이라 아낀 것이 없고 결과만 줄어든다.
    expect(captured?.get('maxResults')).toBe('50')
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

    expect(result.videos).toEqual([])
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

    expect(result.videos[0].thumbnailUrl).toBe('https://i.ytimg.com/vi/a/default.jpg')
  })

  it('썸네일이 하나도 없으면 영상 ID로 URL을 만든다', async () => {
    server.use(
      http.get(SEARCH, () => HttpResponse.json({ items: [{ id: { videoId: 'a' } }] })),
      http.get(VIDEOS, () =>
        HttpResponse.json({
          items: [
            {
              id: 'a',
              snippet: { title: '제목 a', channelTitle: '헬스톡', thumbnails: {} },
              contentDetails: { duration: 'PT30S' },
            },
          ],
        }),
      ),
    )

    const result = await searchShorts('스쿼트', 'test-key')

    expect(result.videos[0].thumbnailUrl).toBe('https://i.ytimg.com/vi/a/hqdefault.jpg')
  })

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
})

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
