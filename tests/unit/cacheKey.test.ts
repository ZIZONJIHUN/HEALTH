import { describe, expect, it } from 'vitest'
import { normalizeQuery } from '@/lib/cacheKey'

describe('normalizeQuery', () => {
  it('앞뒤 공백을 제거한다', () => {
    expect(normalizeQuery('  스쿼트  ')).toBe('스쿼트')
  })

  it('소문자로 바꾼다', () => {
    expect(normalizeQuery('Bench Press')).toBe('bench press')
  })

  it('연속 공백을 한 칸으로 줄인다', () => {
    expect(normalizeQuery('벤치   프레스')).toBe('벤치 프레스')
  })

  it('탭과 줄바꿈도 공백으로 취급한다', () => {
    expect(normalizeQuery('벤치\t\n프레스')).toBe('벤치 프레스')
  })

  it('이미 정규화된 값은 그대로 둔다', () => {
    expect(normalizeQuery('스쿼트')).toBe('스쿼트')
  })

  it('공백만 있으면 빈 문자열이다', () => {
    expect(normalizeQuery('   ')).toBe('')
  })
})
