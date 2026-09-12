import { describe, expect, it } from 'vitest'
import { filterByLength, toLengthFilter } from '@/features/search/lengthFilter'
import type { ShortVideo } from '@/lib/types'

const video = (id: string, durationSeconds: number): ShortVideo => ({
  id,
  title: id,
  channelTitle: '헬스톡',
  thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
  durationSeconds,
})

const videos = [video('a', 25), video('b', 58), video('c', 150)]

describe('toLengthFilter', () => {
  it('아는 값을 필터로 바꾼다', () => {
    expect(toLengthFilter('30').maxSeconds).toBe(30)
    expect(toLengthFilter('60').maxSeconds).toBe(60)
  })

  it('없거나 모르는 값은 전체로 흡수한다', () => {
    // URL 은 사용자가 직접 고칠 수 있다. 이상한 값에 404 를 낼 이유가 없다.
    expect(toLengthFilter(undefined).id).toBe('all')
    expect(toLengthFilter('90').id).toBe('all')
    expect(toLengthFilter('').id).toBe('all')
  })
})

describe('filterByLength', () => {
  it('전체는 원본을 그대로 돌려준다', () => {
    expect(filterByLength(videos, null)).toEqual(videos)
  })

  it('상한 이하만 남긴다', () => {
    expect(filterByLength(videos, 60).map((item) => item.id)).toEqual(['a', 'b'])
    expect(filterByLength(videos, 30).map((item) => item.id)).toEqual(['a'])
  })

  it('경계값을 포함한다', () => {
    expect(filterByLength([video('edge', 60)], 60)).toHaveLength(1)
  })
})
