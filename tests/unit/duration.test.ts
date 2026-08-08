import { describe, expect, it } from 'vitest'
import { formatDuration, parseIso8601Duration } from '@/lib/duration'

describe('parseIso8601Duration', () => {
  it('초만 있는 값을 파싱한다', () => {
    expect(parseIso8601Duration('PT45S')).toBe(45)
  })

  it('분과 초를 파싱한다', () => {
    expect(parseIso8601Duration('PT1M30S')).toBe(90)
  })

  it('분만 있는 값을 파싱한다', () => {
    expect(parseIso8601Duration('PT3M')).toBe(180)
  })

  it('시간까지 파싱한다', () => {
    expect(parseIso8601Duration('PT1H2M3S')).toBe(3723)
  })

  it('일 단위를 파싱한다', () => {
    expect(parseIso8601Duration('P1DT2H')).toBe(93600)
  })

  it('0초 라이브 스트림을 0으로 파싱한다', () => {
    expect(parseIso8601Duration('PT0S')).toBe(0)
  })

  it('형식이 아니면 null을 반환한다', () => {
    expect(parseIso8601Duration('')).toBeNull()
    expect(parseIso8601Duration('45')).toBeNull()
    expect(parseIso8601Duration('PT')).toBeNull()
    expect(parseIso8601Duration('P')).toBeNull()
  })
})

describe('formatDuration', () => {
  it('초를 두 자리로 채운다', () => {
    expect(formatDuration(45)).toBe('0:45')
    expect(formatDuration(5)).toBe('0:05')
  })

  it('분 단위를 표시한다', () => {
    expect(formatDuration(90)).toBe('1:30')
    expect(formatDuration(180)).toBe('3:00')
  })

  it('음수와 소수를 안전하게 처리한다', () => {
    expect(formatDuration(-10)).toBe('0:00')
    expect(formatDuration(45.9)).toBe('0:45')
  })
})
