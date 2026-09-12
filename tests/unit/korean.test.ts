import { describe, expect, it } from 'vitest'
import { particle } from '@/lib/korean'

describe('particle', () => {
  it('받침이 있으면 을, 없으면 를', () => {
    expect(particle('가슴 루틴', '을', '를')).toBe('을') // 틴 — 받침 ㄴ
    expect(particle('스쿼트', '을', '를')).toBe('를') // 트 — 받침 없음
    expect(particle('등', '을', '를')).toBe('을')
    expect(particle('어깨', '을', '를')).toBe('를')
  })

  it('다른 조사 쌍에도 쓴다', () => {
    expect(particle('플랭크', '이', '가')).toBe('가')
    expect(particle('데드리프트', '은', '는')).toBe('는')
    // '스'는 ㅅ이 초성이라 받침이 없다. '벤치프레스는'이 맞다.
    expect(particle('벤치프레스', '은', '는')).toBe('는')
    expect(particle('풀업', '은', '는')).toBe('은') // 업 — 받침 ㅂ
  })

  it('숫자로 끝나면 읽는 소리를 따른다', () => {
    expect(particle('루틴 1', '을', '를')).toBe('을') // 일
    expect(particle('루틴 2', '을', '를')).toBe('를') // 이
    expect(particle('루틴 6', '을', '를')).toBe('을') // 육
  })

  it('뒤 공백에 속지 않는다', () => {
    expect(particle('가슴 루틴  ', '을', '를')).toBe('을')
  })

  it('한글이 아니면 받침 없음으로 본다', () => {
    expect(particle('chest day', '을', '를')).toBe('를')
    expect(particle('', '을', '를')).toBe('를')
  })
})
