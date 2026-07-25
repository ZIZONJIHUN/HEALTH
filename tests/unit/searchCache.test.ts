import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CACHE_TTL_MS, isCacheFresh, readCache, writeCache } from '@/lib/searchCache'

const NOW = new Date('2026-07-25T00:00:00.000Z').getTime()

function daysAgo(days: number): string {
  return new Date(NOW - days * 24 * 60 * 60 * 1000).toISOString()
}

describe('isCacheFresh', () => {
  it('TTL이 7일이다', () => {
    expect(CACHE_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000)
  })

  it('방금 만든 항목은 신선하다', () => {
    expect(isCacheFresh(daysAgo(0), NOW)).toBe(true)
  })

  it('6일 전 항목은 신선하다', () => {
    expect(isCacheFresh(daysAgo(6), NOW)).toBe(true)
  })

  it('8일 전 항목은 만료됐다', () => {
    expect(isCacheFresh(daysAgo(8), NOW)).toBe(false)
  })

  it('날짜로 해석할 수 없으면 만료로 본다', () => {
    expect(isCacheFresh('언젠가', NOW)).toBe(false)
  })
})

describe('Supabase 환경변수가 없을 때', () => {
  const saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY }

  beforeEach(() => {
    delete process.env.SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
  })

  afterEach(() => {
    if (saved.url) process.env.SUPABASE_URL = saved.url
    if (saved.key) process.env.SUPABASE_SERVICE_ROLE_KEY = saved.key
  })

  it('읽기는 null을 반환한다', async () => {
    await expect(readCache('스쿼트')).resolves.toBeNull()
  })

  it('쓰기는 조용히 성공한다', async () => {
    await expect(writeCache('스쿼트', [])).resolves.toBeUndefined()
  })
})
