'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabasePublicConfig } from './env'

/**
 * 브라우저에서 쓰는 anon 클라이언트. **RLS 가 적용된다.**
 *
 * 설정이 없으면 null 이다. 그때 화면은 로그인 버튼을 비활성으로 두고 이유를
 * 적는다 — 캐시가 없을 때 앱이 그냥 동작하는 것과 같은 태도다.
 *
 * @supabase/ssr 이 내부적으로 싱글턴을 유지하므로 여기서 캐시하지 않는다.
 */
export function createSupabaseBrowserClient(): SupabaseClient | null {
  const config = supabasePublicConfig()
  if (!config) return null
  return createBrowserClient(config.url, config.anonKey)
}
