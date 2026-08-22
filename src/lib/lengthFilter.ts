import type { ShortVideo } from './types'

/**
 * 길이 필터는 이미 받아온 결과를 걸러낼 뿐이라 YouTube 쿼터를 쓰지 않는다.
 * 캐시 키도 검색어만 쓰므로(normalizeQuery) 필터를 바꿔도 캐시에 그대로 적중한다.
 */
export const LENGTH_FILTERS = [
  { id: 'all', label: '전체', maxSeconds: null },
  { id: '60', label: '1분 이하', maxSeconds: 60 },
  { id: '30', label: '30초 이하', maxSeconds: 30 },
] as const

export type LengthFilterId = (typeof LENGTH_FILTERS)[number]['id']

const DEFAULT_FILTER = LENGTH_FILTERS[0]

/** URL 의 len 파라미터를 필터로 바꾼다. 모르는 값은 '전체'로 흡수한다. */
export function toLengthFilter(raw: string | undefined) {
  return LENGTH_FILTERS.find((filter) => filter.id === raw) ?? DEFAULT_FILTER
}

export function filterByLength(videos: ShortVideo[], maxSeconds: number | null): ShortVideo[] {
  if (maxSeconds === null) return videos
  return videos.filter((video) => video.durationSeconds <= maxSeconds)
}
