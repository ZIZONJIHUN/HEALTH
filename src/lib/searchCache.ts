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

/**
 * 메모리에 들고 있을 검색어 수.
 *
 * 상한이 없으면 오래 떠 있는 프로세스에서 Map 이 계속 자란다. Map 은 삽입 순서를
 * 지키므로 가장 오래 안 쓴 것부터 버리면 된다 (읽을 때 다시 넣어 순서를 갱신한다).
 * 45개 고정 검색어(부위 칩 25 + 인기 운동 20)에 여유를 더한 값이다.
 */
const MEMORY_CACHE_MAX = 200

/** 테스트 전용. 프로세스 내 캐시를 비운다. */
export function clearMemoryCache(): void {
  memoryCache.clear()
}

function readMemory(key: string, allowStale: boolean, now: number): ShortVideo[] | null {
  const entry = memoryCache.get(key)
  if (!entry) return null
  if (!allowStale && now - entry.createdAt > CACHE_TTL_MS) return null

  // 최근 사용으로 올린다 (재삽입 = 순서 맨 뒤).
  memoryCache.delete(key)
  memoryCache.set(key, entry)
  return entry.payload
}

function writeMemory(key: string, videos: ShortVideo[], createdAt = Date.now()): void {
  memoryCache.delete(key)
  if (memoryCache.size >= MEMORY_CACHE_MAX) {
    const oldest = memoryCache.keys().next().value
    if (oldest !== undefined) memoryCache.delete(oldest)
  }
  memoryCache.set(key, { payload: videos, createdAt })
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
  const { allowStale = false, now = Date.now() } = options
  const key = normalizeQuery(query)

  /*
    메모리를 먼저 본다.

    적중분을 메모리에 채워 두기만 하고 읽을 때 Supabase 를 먼저 보면 왕복이 그대로라
    아무것도 아낀 것이 없다. 여기서 끊어야 한다.

    다른 인스턴스가 같은 검색어를 새로 채워도 이 프로세스는 TTL 이 끝날 때까지
    자기 사본을 쓴다. 감수할 만하다 — 캐시의 계약 자체가 "7일 안에 찾은 결과"이고,
    두 사본 모두 그 계약을 만족한다. 만든 시각은 행의 created_at 을 그대로 들고 있어서
    TTL 이 늘어나지도 않는다.
  */
  const local = readMemory(key, allowStale, now)
  if (local) return local

  const client = getSupabaseClient()
  if (!client) return null

  try {
    const result = await withTimeout(
      client.from(TABLE).select('payload, created_at').eq('query_key', key).maybeSingle(),
    )

    // 메모리는 이미 봤다. 여기서 남은 선택지는 "없음"뿐이다.
    if (result === TIMED_OUT) {
      warnCacheFailure('읽기', '응답이 없습니다')
      return null
    }
    if (result.error) {
      warnCacheFailure('읽기', result.error.message)
      return null
    }

    const { data } = result
    if (!data) return null

    const createdAt = data.created_at as string
    const payload = data.payload as ShortVideo[]

    /*
      Supabase 적중분을 메모리에도 채운다.
      이게 없으면 7일 동안 변하지 않는 데이터인데도 요청마다 Supabase 를 왕복한다 —
      인기 검색어일수록 손해가 크다.

      만든 시각은 **행의 created_at 을 그대로** 쓴다. Date.now() 로 찍으면 6일 된 행이
      메모리에서 다시 7일을 살아 실질 TTL 이 최대 14일이 된다.
    */
    const createdAtMs = new Date(createdAt).getTime()
    if (!Number.isNaN(createdAtMs)) writeMemory(key, payload, createdAtMs)

    if (!allowStale && !isCacheFresh(createdAt, now)) return null
    return payload
  } catch (cause) {
    warnCacheFailure('읽기', cause)
    return null
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
