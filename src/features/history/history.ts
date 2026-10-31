import { normalizeQuery } from '@/lib/cacheKey'
import type { ShortVideo } from '@/lib/types'

/**
 * 최근 검색어와 최근 본 영상.
 *
 * 루틴과 달리 동기화하지 않는다. 기기마다 다른 게 자연스럽고, 잃어도 아쉽지 않은
 * 편의 기능이다. 저장 매체를 아는 코드는 routines.ts 처럼 이 파일에만 둔다.
 *
 * 영상은 메타데이터를 통째로 저장한다. 다시 틀 때 YouTube 에 물어보면 쿼터를 쓴다.
 */

const STORAGE_KEY = 'health-shorts:history:v1'

export const MAX_SEARCHES = 8
export const MAX_VIDEOS = 12

export type History = {
  searches: string[]
  videos: ShortVideo[]
}

/** 참조를 고정한다 — useSyncExternalStore 가 참조로 변경을 판단한다. */
export const EMPTY_HISTORY: History = { searches: [], videos: [] }

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

let cachedRaw: string | null = null
let cachedHistory: History = EMPTY_HISTORY

function isVideo(value: unknown): value is ShortVideo {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<ShortVideo>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.title === 'string' &&
    typeof candidate.channelTitle === 'string' &&
    typeof candidate.thumbnailUrl === 'string' &&
    typeof candidate.durationSeconds === 'number'
  )
}

function parse(raw: string): History {
  try {
    const parsed = JSON.parse(raw) as Partial<Record<keyof History, unknown>>
    const searches = Array.isArray(parsed?.searches)
      ? parsed.searches.filter((item): item is string => typeof item === 'string')
      : []
    const videos = Array.isArray(parsed?.videos) ? parsed.videos.filter(isVideo) : []
    return { searches, videos }
  } catch {
    // 손상된 값 때문에 홈 화면이 죽는 것보다 기록을 잃는 편이 낫다.
    return EMPTY_HISTORY
  }
}

export function loadHistory(): History {
  if (!isBrowser()) return EMPTY_HISTORY

  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return EMPTY_HISTORY
  }

  if (raw === cachedRaw) return cachedHistory
  cachedRaw = raw
  cachedHistory = raw ? parse(raw) : EMPTY_HISTORY
  return cachedHistory
}

const listeners = new Set<() => void>()

/**
 * 저장 실패는 조용히 넘긴다. 루틴과 달리 사용자가 "담았다"고 믿는 데이터가 아니라서
 * 알려 줄 이유가 없다.
 */
function commit(history: History): void {
  if (!isBrowser()) return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(history))
  } catch {
    // 용량 초과 등. 기록이 안 남을 뿐이다.
  }
  for (const listener of listeners) listener()
}

export function subscribeHistory(listener: () => void): () => void {
  listeners.add(listener)
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

/** 대소문자·공백만 다른 검색어는 같은 것으로 본다. 캐시 키도 같다. */
export function recordSearch(raw: string): void {
  const query = raw.trim().replace(/\s+/g, ' ')
  if (!query) return

  const key = normalizeQuery(query)
  const history = loadHistory()
  if (history.searches[0] && normalizeQuery(history.searches[0]) === key) return

  const searches = [query, ...history.searches.filter((item) => normalizeQuery(item) !== key)]
  commit({ ...history, searches: searches.slice(0, MAX_SEARCHES) })
}

export function removeSearch(query: string): void {
  const key = normalizeQuery(query)
  const history = loadHistory()
  commit({ ...history, searches: history.searches.filter((item) => normalizeQuery(item) !== key) })
}

export function clearSearches(): void {
  commit({ ...loadHistory(), searches: [] })
}

/** 피드에서 슬라이드가 바뀔 때마다 불린다. 이미 맨 앞이면 쓰지 않는다. */
export function recordView(video: ShortVideo): void {
  const history = loadHistory()
  if (history.videos[0]?.id === video.id) return

  const videos = [video, ...history.videos.filter((item) => item.id !== video.id)]
  commit({ ...history, videos: videos.slice(0, MAX_VIDEOS) })
}

export function clearVideos(): void {
  commit({ ...loadHistory(), videos: [] })
}
