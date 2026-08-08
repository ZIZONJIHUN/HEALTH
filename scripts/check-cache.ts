import { createClient } from '@supabase/supabase-js'
import { normalizeQuery } from '../src/lib/cacheKey'
import { readCache, writeCache } from '../src/lib/searchCache'

/**
 * 탐침 행을 정리한다. getClient()는 searchCache.ts 내부 전용이라 여기서는
 * createClient로 별도 클라이언트를 만든다. 정리 실패는 검증 결과를 뒤집지 않으므로
 * 오류는 무시한다.
 */
async function deleteProbe(queryKey: string): Promise<void> {
  try {
    const url = process.env.SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) return
    const client = createClient(url, key, { auth: { persistSession: false } })
    await client.from('search_cache').delete().eq('query_key', normalizeQuery(queryKey))
  } catch {
    // 정리 실패는 무시한다.
  }
}

/**
 * 실제 Supabase에 쓰고 읽어서 캐시가 정말 동작하는지 확인한다.
 * 마이그레이션 실행 여부, service_role 키 권한, 테이블·컬럼명을 한 번에 검증한다.
 * 목 테스트로는 PostgREST가 요청을 받아들이는지 알 수 없어서 이 스크립트가 필요하다.
 */
async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 없습니다.')
    console.log('캐시 없이도 앱은 동작합니다. 다만 같은 검색어도 매번 쿼터를 씁니다.')
    return
  }

  const probeQuery = '__cache_check__'
  const probe = [
    {
      id: 'probe',
      title: '왕복 검증',
      channelTitle: 'check',
      thumbnailUrl: 'https://i.ytimg.com/vi/probe/hqdefault.jpg',
      durationSeconds: 42,
    },
  ]

  await writeCache(probeQuery, probe)
  const readBack = await readCache(probeQuery)

  if (!readBack) {
    console.error('실패: 쓴 값을 다시 읽지 못했습니다.')
    console.error('supabase/migrations/0001_search_cache.sql 을 실행했는지,')
    console.error('SUPABASE_SERVICE_ROLE_KEY 가 anon 키가 아닌 service_role 키인지 확인하세요.')
    console.error('위에 [search_cache] 경고가 있으면 그게 원인입니다.')
    process.exitCode = 1
    return
  }

  if (readBack[0]?.durationSeconds !== 42) {
    console.error('실패: 읽은 값이 쓴 값과 다릅니다.', readBack)
    process.exitCode = 1
    return
  }

  await deleteProbe(probeQuery)
  console.log('성공: 캐시 쓰기와 읽기가 정상입니다.')
}

void main()
