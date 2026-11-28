import { describe, expect, it } from 'vitest'
import { adjustRest, remaining, startRest } from '@/features/routines/restTimer'

describe('restTimer', () => {
  it('끝나는 시각 기준으로 남은 시간을 센다', () => {
    const run = startRest(90, 0)
    expect(remaining(run, 0)).toBe(90)
    expect(remaining(run, 30_500)).toBe(60) // 올림
    expect(remaining(run, 200_000)).toBe(0) // 백그라운드에서 오래 있다 돌아옴
  })

  it('10초씩 늘리고 줄이되 범위를 지킨다', () => {
    expect(remaining(adjustRest(startRest(60, 0), 10, 0), 0)).toBe(70)
    expect(remaining(adjustRest(startRest(10, 0), -10, 0), 0)).toBe(10)
    expect(remaining(adjustRest(startRest(300, 0), 10, 0), 0)).toBe(300)
  })

  it('조절은 지금 시각의 남은 시간을 기준으로 한다', () => {
    const run = startRest(60, 0)
    // 남은 30초에서 −10 → 20초
    expect(remaining(adjustRest(run, -10, 30_000), 30_000)).toBe(20)
    // 남은 15초에서 −10 은 10초에서 멈춘다(10초 미만으로 줄이지 않는다)
    expect(remaining(adjustRest(run, -10, 45_000), 45_000)).toBe(10)
    // 이미 10초 미만(남은 5초)이면 줄이지도, 늘려 놓지도 않는다
    const low = adjustRest(run, -10, 55_000)
    expect(remaining(low, 55_000)).toBe(5)
    // 남은 295초에서 +10 은 300 에서 멈춘다
    expect(remaining(adjustRest(startRest(300, 0), 10, 5_000), 5_000)).toBe(300)
  })

  it('total 은 시작값과 조절을 반영한다', () => {
    expect(startRest(90, 1_000)).toEqual({ endsAt: 91_000, total: 90 })
    expect(adjustRest(startRest(60, 0), 10, 0).total).toBe(70)
  })
})
