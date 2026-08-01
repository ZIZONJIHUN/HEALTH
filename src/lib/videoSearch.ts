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
