import { describe, expect, it } from 'vitest'
import { findReturnEntry, searchHomeHref } from '@/features/feed/homeTarget'

const ORIGIN = 'https://example.com'
const entry = (key: string, path: string) => ({ key, url: `${ORIGIN}${path}` })

describe('searchHomeHref', () => {
  it('검색어만 있으면 검색어만 남긴다', () => {
    expect(searchHomeHref({ q: '스쿼트' })).toBe('/?q=%EC%8A%A4%EC%BF%BC%ED%8A%B8')
  })

  it('그리드가 쓰던 길이 필터와 페이지를 그대로 넘긴다 — 같은 그리드로 돌아가야 한다', () => {
    expect(searchHomeHref({ q: 'squat', len: 'short', pages: '2' })).toBe(
      '/?q=squat&len=short&pages=2',
    )
  })
})

describe('findReturnEntry', () => {
  it('지금보다 앞에 있는 같은 검색 화면을 찾는다', () => {
    const entries = [entry('a', '/'), entry('b', '/?q=squat'), entry('c', '/feed?q=squat&i=0')]
    expect(findReturnEntry(entries, 2, '/?q=squat')).toBe('b')
  })

  it('같은 화면이 여러 번 있으면 가장 가까운 것', () => {
    const entries = [
      entry('a', '/?q=squat'),
      entry('b', '/feed?q=squat&i=0'),
      entry('c', '/?q=squat'),
      entry('d', '/feed?q=squat&i=3'),
    ]
    expect(findReturnEntry(entries, 3, '/?q=squat')).toBe('c')
  })

  it('검색어나 필터가 다르면 다른 화면이다', () => {
    const entries = [
      entry('a', '/?q=lunge'),
      entry('b', '/?q=squat&len=short'),
      entry('c', '/feed?q=squat&i=0'),
    ]
    expect(findReturnEntry(entries, 2, '/?q=squat')).toBeNull()
  })

  it('검색어 없는 홈을 찾을 때 검색 화면을 홈으로 치지 않는다', () => {
    const entries = [entry('a', '/?q=squat'), entry('b', '/feed?recent=1&i=0')]
    expect(findReturnEntry(entries, 1, '/')).toBeNull()
  })

  it('지금보다 뒤(앞으로 가기 쪽)에 있는 항목은 보지 않는다', () => {
    const entries = [entry('a', '/feed?q=squat&i=0'), entry('b', '/?q=squat')]
    expect(findReturnEntry(entries, 0, '/?q=squat')).toBeNull()
  })

  it('주소를 모르는 항목(다른 출처)은 건너뛴다', () => {
    const entries = [entry('a', '/routines'), { key: 'x', url: null }, entry('c', '/feed?routine=r1&i=0')]
    expect(findReturnEntry(entries, 2, '/routines')).toBe('a')
  })
})
