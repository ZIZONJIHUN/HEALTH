import { beforeEach, describe, expect, it, vi } from 'vitest'
import { consumeApiBudget, DAILY_CALL_LIMIT, resetApiBudgetForTest } from '@/lib/apiBudget'

/**
 * Supabase 없이 메모리 카운터 경로만 검증한다.
 * Supabase 경로의 원자성은 SQL(ON CONFLICT ... WHERE)이 보장하는 것이라
 * 여기서 목으로 흉내 내도 의미가 없다 — 실제 검증은 0002 마이그레이션을 실행한
 * 프로젝트에서 이루어진다.
 */
beforeEach(() => {
  delete process.env.SUPABASE_URL
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
  resetApiBudgetForTest()
})

describe('consumeApiBudget', () => {
  it('상한까지는 허용한다', async () => {
    for (let i = 0; i < DAILY_CALL_LIMIT; i += 1) {
      expect(await consumeApiBudget()).toBe(true)
    }
  })

  it('상한을 넘으면 거부한다', async () => {
    for (let i = 0; i < DAILY_CALL_LIMIT; i += 1) await consumeApiBudget()

    expect(await consumeApiBudget()).toBe(false)
    expect(await consumeApiBudget()).toBe(false)
  })

  it('상한이 일일 쿼터 안에 있다', () => {
    // 검색 1회 = 101 units, 일일 무료 쿼터 = 10,000 units.
    // 이 단정이 깨지면 예산 카운터가 쿼터보다 늦게 멈춘다 = 방어가 무의미해진다.
    expect(DAILY_CALL_LIMIT * 101).toBeLessThan(10_000)
  })

  it('날짜가 바뀌면 예산이 초기화된다', async () => {
    for (let i = 0; i < DAILY_CALL_LIMIT; i += 1) await consumeApiBudget()
    expect(await consumeApiBudget()).toBe(false)

    const realNow = Date.now()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(realNow + 24 * 60 * 60 * 1000)

    try {
      expect(await consumeApiBudget()).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})
