import { parseIso8601Duration } from './duration'
import { filterShorts } from './shorts'
import type { ShortVideo } from './types'

const DEFAULT_API_BASE = 'https://www.googleapis.com/youtube/v3'

/** YouTube 일일 쿼터가 소진된 상태. 캐시 폴백으로 전환하는 신호다. */
export class QuotaExceededError extends Error {
  constructor() {
    super('YouTube API quota exceeded')
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

async function readJson<T>(response: Response, label: string): Promise<T> {
  if (response.ok) return (await response.json()) as T

  const body = await response.text()
  if (response.status === 403 && body.includes('quotaExceeded')) {
    throw new QuotaExceededError()
  }
  throw new Error(`YouTube ${label} 호출 실패: ${response.status} ${body}`)
}

function pickThumbnail(thumbnails: VideoItem['snippet']['thumbnails']): string {
  return thumbnails.high?.url ?? thumbnails.medium?.url ?? thumbnails.default?.url ?? ''
}

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
    maxResults: '25',
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
    thumbnailUrl: pickThumbnail(item.snippet.thumbnails),
    durationSeconds: parseIso8601Duration(item.contentDetails.duration) ?? 0,
  }))

  return filterShorts(videos)
}
