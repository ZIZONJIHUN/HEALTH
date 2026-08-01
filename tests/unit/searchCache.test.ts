import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CACHE_TTL_MS, clearMemoryCache, isCacheFresh, readCache, writeCache } from '@/lib/searchCache'

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
    clearMemoryCache()
  })

  afterEach(() => {
    if (saved.url) process.env.SUPABASE_URL = saved.url
    if (saved.key) process.env.SUPABASE_SERVICE_ROLE_KEY = saved.key
  })

  it('쓰지 않은 검색어는 null을 반환한다', async () => {
    await expect(readCache('스쿼트')).resolves.toBeNull()
  })

  it('쓰기는 조용히 성공한다', async () => {
    await expect(writeCache('스쿼트', [])).resolves.toBeUndefined()
  })

  it('쓴 결과를 메모리에서 다시 읽는다', async () => {
    const videos = [
      {
        id: 'a',
        title: '스쿼트 기본',
        channelTitle: '헬스톡',
        thumbnailUrl: 'https://i.ytimg.com/vi/a/hqdefault.jpg',
        durationSeconds: 45,
      },
    ]

    await writeCache('스쿼트', videos)

    await expect(readCache('스쿼트')).resolves.toEqual(videos)
  })

  it('정규화된 검색어를 키로 쓴다', async () => {
    await writeCache('  스쿼트  ', [])

    await expect(readCache('스쿼트')).resolves.toEqual([])
  })

  it('TTL이 지난 메모리 항목은 null을 반환한다', async () => {
    await writeCache('스쿼트', [])
    const later = Date.now() + CACHE_TTL_MS + 1

    await expect(readCache('스쿼트', { now: later })).resolves.toBeNull()
  })

  it('allowStale이면 TTL이 지난 메모리 항목도 반환한다', async () => {
    await writeCache('스쿼트', [])
    const later = Date.now() + CACHE_TTL_MS + 1

    await expect(readCache('스쿼트', { allowStale: true, now: later })).resolves.toEqual([])
  })
})

describe('Supabase 호출이 실패할 때', () => {
  const saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY }

  beforeEach(() => {
    // 도달할 수 없는 호스트를 가리켜 호출을 실패시킨다.
    process.env.SUPABASE_URL = 'http://127.0.0.1:1'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
    clearMemoryCache()
  })

  afterEach(() => {
    if (saved.url) process.env.SUPABASE_URL = saved.url
    else delete process.env.SUPABASE_URL
    if (saved.key) process.env.SUPABASE_SERVICE_ROLE_KEY = saved.key
    else delete process.env.SUPABASE_SERVICE_ROLE_KEY
    vi.restoreAllMocks()
  })

  it('읽기 실패는 null을 반환하고 예외를 던지지 않는다', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(readCache('스쿼트')).resolves.toBeNull()
  }, 15000)

  it('읽기 실패를 경고로 남긴다', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await readCache('스쿼트')

    expect(warn).toHaveBeenCalled()
    expect(String(warn.mock.calls[0]?.[0])).toContain('search_cache')
  }, 15000)

  it('쓰기 실패는 조용히 성공하고 경고를 남긴다', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(writeCache('스쿼트', [])).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalled()
  })
})
