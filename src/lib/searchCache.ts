import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { normalizeQuery } from './cacheKey'
import type { ShortVideo } from './types'

export const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000

const TABLE = 'search_cache'

/**
 * 캐시는 선택 기능이다.
 * 환경변수가 없으면 null을 돌려 캐시 없이 동작하게 한다.
 */
function getClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

export function isCacheFresh(createdAt: string, now: number): boolean {
  const created = new Date(createdAt).getTime()
  if (Number.isNaN(created)) return false
  return now - created <= CACHE_TTL_MS
}

/**
 * 캐시된 검색 결과를 읽는다.
 * allowStale 은 쿼터 초과 폴백용이다. 만료된 결과라도 빈 화면보다 낫다.
 * 캐시 장애는 검색을 실패시키지 않는다. 어떤 오류든 null로 흡수한다.
 */
export async function readCache(
  query: string,
  options: { allowStale?: boolean; now?: number } = {},
): Promise<ShortVideo[] | null> {
  const client = getClient()
  if (!client) return null

  const { allowStale = false, now = Date.now() } = options

  try {
    const { data, error } = await client
      .from(TABLE)
      .select('payload, created_at')
      .eq('query_key', normalizeQuery(query))
      .maybeSingle()

    if (error || !data) return null
    if (!allowStale && !isCacheFresh(data.created_at as string, now)) return null
    return data.payload as ShortVideo[]
  } catch {
    return null
  }
}

/** 검색 결과를 캐시에 저장한다. 실패는 무시한다. */
export async function writeCache(query: string, videos: ShortVideo[]): Promise<void> {
  const client = getClient()
  if (!client) return

  try {
    await client.from(TABLE).upsert({
      query_key: normalizeQuery(query),
      payload: videos,
      created_at: new Date().toISOString(),
    })
  } catch {
    // 캐시 쓰기 실패는 사용자에게 영향이 없다.
  }
}
