import { describe, expect, it } from 'vitest'
import { SHORTS_MAX_SECONDS, filterShorts } from '@/lib/shorts'
import type { ShortVideo } from '@/lib/types'

function video(id: string, durationSeconds: number): ShortVideo {
  return {
    id,
    title: `제목 ${id}`,
    channelTitle: '채널',
    thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    durationSeconds,
  }
}

describe('filterShorts', () => {
  it('상한이 180초다', () => {
    expect(SHORTS_MAX_SECONDS).toBe(180)
  })

  it('180초 이하를 남긴다', () => {
    const result = filterShorts([video('a', 45), video('b', 180)])
    expect(result.map((v) => v.id)).toEqual(['a', 'b'])
  })

  it('180초를 넘으면 제외한다', () => {
    const result = filterShorts([video('a', 45), video('b', 181), video('c', 1200)])
    expect(result.map((v) => v.id)).toEqual(['a'])
  })

  it('0초 라이브 스트림을 제외한다', () => {
    const result = filterShorts([video('live', 0), video('a', 30)])
    expect(result.map((v) => v.id)).toEqual(['a'])
  })

  it('원래 순서를 유지한다', () => {
    const result = filterShorts([video('c', 30), video('a', 20), video('b', 10)])
    expect(result.map((v) => v.id)).toEqual(['c', 'a', 'b'])
  })

  it('상한을 직접 지정할 수 있다', () => {
    const result = filterShorts([video('a', 45), video('b', 90)], 60)
    expect(result.map((v) => v.id)).toEqual(['a'])
  })
})
