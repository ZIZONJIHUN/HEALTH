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
    // 서버리스에서는 응답을 보낸 뒤 떠 있는 프로미스가 완료된다는 보장이 없다.
    // await 를 빼면 인스턴스가 얼어붙어 캐시가 영영 기록되지 않을 수 있고,
    // 그러면 쿼터를 아끼려던 캐시의 존재 이유가 사라진다. 지연을 감수한다.
    await writeCache(query, videos)
    return { query, videos, fromCache: false, quotaExceeded: false }
  } catch (error) {
    if (!(error instanceof QuotaExceededError)) throw error

    const stale = await readCache(query, { allowStale: true })
    // stale 이 없으면 캐시에서 온 것이 아니다. 빈 결과에 "캐시됨"을 붙이면
    // UI가 "저장된 결과를 보여준다"고 잘못 안내하게 된다.
    return { query, videos: stale ?? [], fromCache: stale !== null, quotaExceeded: true }
  }
}
