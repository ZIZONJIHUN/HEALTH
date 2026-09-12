import { consumeApiBudget } from './apiBudget'
import { isSearchableQuery, MAX_QUERY_LENGTH, normalizeQuery } from './cacheKey'
import { readCache, writeCache } from './searchCache'
import type { VideoSearchResult } from './types'
import { QuotaExceededError, searchShorts } from './youtube'

/**
 * 캐시 우선 검색.
 *
 * 이 함수는 사용자 입력이 YouTube 쿼터에 닿는 **유일한 경로**다. 서버 컴포넌트가
 * `searchParams.q` 를 그대로 흘려보내므로, 검색어 검증과 호출 예산은 라우트가 아니라
 * 여기에 있어야 한다. 라우트마다 방어를 두면 라우트를 하나 더 만들 때 빠뜨린다.
 *
 * 쿼터가 소진되면 만료된 캐시라도 돌려주고 배너 신호를 켠다.
 */

/**
 * 진행 중인 같은 검색어 요청.
 *
 * 없으면 동시에 들어온 N 개의 같은 검색이 전부 캐시 미스로 판정되어 N × 101 units 를
 * 쓴다. 인기 검색어가 캐시에서 만료되는 순간이 정확히 그 상황이다(캐시 스탬피드).
 * 뒤늦게 온 요청은 앞선 요청의 프로미스에 합류한다.
 */
const inFlight = new Map<string, Promise<VideoSearchResult>>()

export function getVideos(rawQuery: string): Promise<VideoSearchResult> {
  const query = normalizeQuery(rawQuery)

  if (!isSearchableQuery(query)) {
    // 화면(EmptyState)이 이 값을 그대로 그린다. 상한을 넘긴 검색어를 그대로 돌려주면
    // 쿼터는 막았는데 10KB 짜리 문자열이 HTML 로 나가는 상태가 된다.
    return Promise.resolve({
      query: query.slice(0, MAX_QUERY_LENGTH),
      videos: [],
      fromCache: false,
      quotaExceeded: false,
    })
  }

  const joined = inFlight.get(query)
  if (joined) return joined

  const work = resolveVideos(query).finally(() => inFlight.delete(query))
  inFlight.set(query, work)
  return work
}

async function resolveVideos(query: string): Promise<VideoSearchResult> {
  const cached = await readCache(query)
  if (cached) {
    return { query, videos: cached, fromCache: true, quotaExceeded: false }
  }

  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) throw new Error('YOUTUBE_API_KEY 환경변수가 필요합니다')

  try {
    // 예산 초과를 QuotaExceededError 로 던져 아래 폴백 경로를 그대로 재사용한다.
    // 사용자 입장에서 "한도에 걸렸다"는 사실은 같고, 화면도 같아야 한다.
    if (!(await consumeApiBudget())) throw new QuotaExceededError()

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
