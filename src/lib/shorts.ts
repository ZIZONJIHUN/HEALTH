import type { ShortVideo } from './types'

/** YouTube 공식 쇼츠 상한. */
export const SHORTS_MAX_SECONDS = 180

/**
 * 길이 기준으로 쇼츠만 남긴다.
 * 0초는 라이브 스트림이므로 제외한다.
 */
export function filterShorts(
  videos: ShortVideo[],
  maxSeconds: number = SHORTS_MAX_SECONDS,
): ShortVideo[] {
  return videos.filter((video) => video.durationSeconds > 0 && video.durationSeconds <= maxSeconds)
}
