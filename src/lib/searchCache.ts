import { normalizeQuery } from './cacheKey'
import { getSupabaseClient, TIMED_OUT, withTimeout } from './supabase'
import type { ShortVideo } from './types'

export const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000

const TABLE = 'search_cache'

/**
 * 캐시 장애를 서버 로그로만 남긴다.
 * 사용자에게 보이는 동작은 바꾸지 않는다 — 캐시는 성능 최적화이지 정확성 의존성이 아니다.
 * 로그가 없으면 컬럼명 오타나 마이그레이션 미실행으로 캐시가 완전히 죽어도
 * 앱은 정상 동작하는 것처럼 보이고 쿼터만 태운다.
 */
function warnCacheFailure(operation: string, cause: unknown): void {
  const reason = cause instanceof Error ? cause.message : String(cause)
  console.warn(`[search_cache] ${operation} 실패 — 메모리 캐시로 대체합니다: ${reason}`)
}

export function isCacheFresh(createdAt: string, now: number): boolean {
  const created = new Date(createdAt).getTime()
  if (Number.isNaN(created)) return false
  return now - created <= CACHE_TTL_MS
}

type MemoryEntry = { payload: ShortVideo[]; createdAt: number }

/**
 * 프로세스 내 캐시.
 *
 * 예전에는 Supabase 환경변수가 없을 때만 쓰는 폴백이었지만, 그 설계에는 구멍이 있었다 —
 * Supabase 가 **설정돼 있는데 죽은** 상태에서는 getSupabaseClient() 가 클라이언트를
 * 돌려주므로 메모리 캐시가 아예 동작하지 않았다. 장애 중에 캐시도 없고 매 요청이 느린,
 * 가장 나쁜 조합이었다.
 *
 * 지금은 2계층이다. Supabase 를 먼저 보고, 실패하거나 늦으면 메모리로 내려간다.
 * 쓰기는 항상 양쪽에 한다. 프로세스가 죽으면 사라지고 인스턴스 간에 공유되지 않지만,
 * 장애 구간 동안 같은 검색어가 쿼터를 반복해서 태우는 것은 막는다.
 */
const memoryCache = new Map<string, MemoryEntry>()

/** 테스트 전용. 프로세스 내 캐시를 비운다. */
export function clearMemoryCache(): void {
  memoryCache.clear()
}

function readMemory(key: string, allowStale: boolean, now: number): ShortVideo[] | null {
  const entry = memoryCache.get(key)
  if (!entry) return null
  if (!allowStale && now - entry.createdAt > CACHE_TTL_MS) return null
  return entry.payload
}

function writeMemory(key: string, videos: ShortVideo[]): void {
  memoryCache.set(key, { payload: videos, createdAt: Date.now() })
}

/**
 * 캐시된 검색 결과를 읽는다.
 * allowStale 은 쿼터 초과 폴백용이다. 만료된 결과라도 빈 화면보다 낫다.
 * 캐시 장애는 검색을 실패시키지 않는다. 어떤 오류든 메모리 캐시 조회로 흡수한다.
 */
export async function readCache(
  query: string,
  options: { allowStale?: boolean; now?: number } = {},
): Promise<ShortVideo[] | null> {
  const client = getSupabaseClient()
  const { allowStale = false, now = Date.now() } = options
  const key = normalizeQuery(query)

  if (!client) return readMemory(key, allowStale, now)

  try {
    const result = await withTimeout(
      client.from(TABLE).select('payload, created_at').eq('query_key', key).maybeSingle(),
    )

    if (result === TIMED_OUT) {
      warnCacheFailure('읽기', '응답이 없습니다')
      return readMemory(key, allowStale, now)
    }
    if (result.error) {
      warnCacheFailure('읽기', result.error.message)
      return readMemory(key, allowStale, now)
    }

    const { data } = result
    if (!data) return null
    if (!allowStale && !isCacheFresh(data.created_at as string, now)) return null
    return data.payload as ShortVideo[]
  } catch (cause) {
    warnCacheFailure('읽기', cause)
    return readMemory(key, allowStale, now)
  }
}

/**
 * 검색 결과를 캐시에 저장한다. 실패는 로그만 남기고 삼킨다.
 * 메모리에는 항상 쓴다 — Supabase 쓰기가 실패한 구간에서도 같은 검색어가
 * 쿼터를 다시 태우지 않게 하는 것이 이 함수의 목적이기 때문이다.
 */
export async function writeCache(query: string, videos: ShortVideo[]): Promise<void> {
  const client = getSupabaseClient()
  const key = normalizeQuery(query)

  writeMemory(key, videos)
  if (!client) return

  try {
    const result = await withTimeout(
      client.from(TABLE).upsert({
        query_key: key,
        payload: videos,
        created_at: new Date().toISOString(),
      }),
    )

    if (result === TIMED_OUT) warnCacheFailure('쓰기', '응답이 없습니다')
    else if (result.error) warnCacheFailure('쓰기', result.error.message)
  } catch (cause) {
    warnCacheFailure('쓰기', cause)
  }
}
