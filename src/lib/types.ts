export type ShortVideo = {
  id: string
  title: string
  channelTitle: string
  thumbnailUrl: string
  durationSeconds: number
}

export type VideoSearchResult = {
  query: string
  videos: ShortVideo[]
  fromCache: boolean
  quotaExceeded: boolean
  /** 아직 받아오지 않은 결과가 남아 있다. 화면의 "더 보기"가 이 값으로 결정된다. */
  hasMore: boolean
  /** 지금까지 받아온 페이지 수. "더 보기" 링크가 이 값 + 1 을 요청한다. */
  pages: number
}

/**
 * 캐시에 저장하는 모양.
 *
 * 영상 배열만 담던 예전 모양과 구분된다. 페이지를 이어받으려면 **다음 페이지 토큰이
 * 있어야** 하는데, YouTube 의 search.list 는 offset 을 지원하지 않고 직전 응답이 준
 * pageToken 으로만 다음 페이지를 가져올 수 있기 때문이다.
 */
export type CachedSearch = {
  videos: ShortVideo[]
  /** null 이면 더 받을 것이 없다. */
  nextPageToken: string | null
  pages: number
}
