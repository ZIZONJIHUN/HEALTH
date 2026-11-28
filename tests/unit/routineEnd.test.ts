import { describe, expect, it } from 'vitest'
import { autoCompletesOnEnd } from '@/features/feed/routineEnd'

describe('autoCompletesOnEnd', () => {
  it('처음부터 재생한 루틴의 마지막 운동이 끝나면 기록한다', () => {
    expect(autoCompletesOnEnd({ routineMode: true, startIndex: 0, index: 4, lastIndex: 4 })).toBe(true)
  })

  it('중간 운동부터 열었으면 마지막이 끝나도 기록하지 않는다 — 자세만 다시 본 것일 수 있다', () => {
    expect(autoCompletesOnEnd({ routineMode: true, startIndex: 4, index: 4, lastIndex: 4 })).toBe(false)
    expect(autoCompletesOnEnd({ routineMode: true, startIndex: 2, index: 4, lastIndex: 4 })).toBe(false)
  })

  it('마지막이 아니거나 루틴 재생이 아니면 기록하지 않는다', () => {
    expect(autoCompletesOnEnd({ routineMode: true, startIndex: 0, index: 3, lastIndex: 4 })).toBe(false)
    expect(autoCompletesOnEnd({ routineMode: false, startIndex: 0, index: 4, lastIndex: 4 })).toBe(false)
  })
})
