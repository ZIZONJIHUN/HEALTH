import { parseIso8601Duration } from './duration'
import { filterShorts } from './shorts'
import type { ShortVideo } from './types'

const DEFAULT_API_BASE = 'https://www.googleapis.com/youtube/v3'

/** YouTube 일일 쿼터가 소진된 상태. 캐시 폴백으로 전환하는 신호다. */
export class QuotaExceededError extends Error {
  constructor() {
    super('YouTube API quota or rate limit exceeded')
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

/**
 * high → medium → default 순으로 고르고, 셋 다 없으면 영상 ID로 URL을 만든다.
 * hqdefault.jpg 는 모든 영상 ID에 대해 유효하므로 빈 문자열을 반환할 일이 없다.
 * 빈 src 는 예외를 던지지 않고 깨진 이미지 칸으로 남아 조용히 나쁘다.
 */
function pickThumbnail(thumbnails: VideoItem['snippet']['thumbnails'], videoId: string): string {
  return (
    thumbnails.high?.url ??
    thumbnails.medium?.url ??
    thumbnails.default?.url ??
    `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
  )
}

/**
 * search.list 가 한 번에 돌려줄 수 있는 최대치.
 *
 * **search.list 는 5개를 요청하든 50개를 요청하든 똑같이 100 units다.** 적게 요청하면
 * 아낀 것이 없고 결과만 줄어든다. 예전에 25로 두었던 탓에 낸 값의 절반만 받고 있었다.
 *
 * videos.list 도 id 를 50개까지 한 번에 받고 1 unit 이라 호출 수가 늘지 않는다.
 * 즉 25 → 50 은 비용이 완전히 같다.
 */
const MAX_SEARCH_RESULTS = 50

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
    maxResults: String(MAX_SEARCH_RESULTS),
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
    thumbnailUrl: pickThumbnail(item.snippet.thumbnails, item.id),
    durationSeconds: parseIso8601Duration(item.contentDetails.duration) ?? 0,
  }))

  return filterShorts(videos)
}
