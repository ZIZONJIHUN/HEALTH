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
}
