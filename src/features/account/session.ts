import { createSupabaseServerClient } from '@/lib/supabase/server'

export type AccountRole = 'user' | 'admin'

export type AccountUser = {
  id: string
  email: string | null
  role: AccountRole
}

/**
 * 프로필 행에서 역할을 읽는다.
 *
 * 프로필이 없거나 모르는 값이면 일반 사용자로 본다. 두 가지 이유다.
 * 1. 트리거가 한 번 실패한 사용자가 앱에 영영 못 들어오면 안 된다.
 * 2. '없으면 일반 사용자' 가 안전한 방향이다 — 관리자 권한이 실수로 열리는 쪽이 아니다.
 */
export function roleFromProfile(profile: { role?: string | null } | null): AccountRole {
  return profile?.role === 'admin' ? 'admin' : 'user'
}

/**
 * 지금 로그인한 사용자. 비로그인이거나 Supabase 미설정이면 null.
 *
 * getUser() 를 쓴다. getSession() 은 쿠키를 그대로 믿지만 getUser() 는 Supabase 에
 * 물어 토큰을 검증한다. 쿠키는 클라이언트가 보내는 값이라 서버에서 권한 판단의
 * 근거로 삼으려면 검증된 쪽이어야 한다.
 */
export async function getAccountUser(): Promise<AccountUser | null> {
  const supabase = await createSupabaseServerClient()
  if (!supabase) return null

  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return null

  // 프로필 조회가 실패해도 로그인 자체는 유효하다. 역할만 기본값으로 떨어진다.
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', data.user.id)
    .maybeSingle()

  return {
    id: data.user.id,
    email: data.user.email ?? null,
    role: roleFromProfile(profile),
  }
}
