import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabasePublicConfig } from './env'

/**
 * 서버에서 쓰는 anon 클라이언트. **RLS 가 적용된다.**
 *
 * service.ts 와 절대 섞지 말 것 — 그쪽은 RLS 를 우회한다.
 * 사용자 데이터를 다루는 서버 코드는 전부 이 함수를 쓴다.
 *
 * 요청마다 새로 만든다. 클라이언트가 그 요청의 쿠키를 들고 있어서, 재사용하면
 * 한 사용자의 세션이 다른 요청에 섞인다.
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient | null> {
  const config = supabasePublicConfig()
  if (!config) return null

  const cookieStore = await cookies()

  return createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        /*
          서버 컴포넌트에서는 쿠키를 쓸 수 없어 Next 가 예외를 던진다.
          그건 오류가 아니다 — 토큰 갱신은 proxy.ts 가 맡고, 여기서는 읽기만
          성공하면 된다. 삼키지 않으면 렌더가 통째로 실패한다.
        */
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // proxy.ts 가 갱신을 책임진다.
        }
      },
    },
  })
}
