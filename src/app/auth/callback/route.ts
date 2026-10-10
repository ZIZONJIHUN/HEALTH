import { NextResponse } from 'next/server'
import { DEFAULT_REDIRECT, safeRedirectTarget } from '@/features/account/redirectTarget'
import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * 구글 동의 후 Supabase 가 여기로 돌려보낸다.
 *
 * 실패는 전부 /account 로 돌아가 안내한다. 에러 화면을 띄우지 않는다 —
 * 로그인은 부가 기능이지 앱의 전제가 아니다.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const next = safeRedirectTarget(url.searchParams.get('next'))
  const code = url.searchParams.get('code')

  // 사용자가 구글에서 취소하면 code 대신 error 가 온다.
  if (url.searchParams.get('error') || !code) {
    return NextResponse.redirect(new URL(`${DEFAULT_REDIRECT}?auth=failed`, url.origin))
  }

  const supabase = await createSupabaseServerClient()
  if (!supabase) {
    return NextResponse.redirect(new URL(`${DEFAULT_REDIRECT}?auth=unconfigured`, url.origin))
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    return NextResponse.redirect(new URL(`${DEFAULT_REDIRECT}?auth=failed`, url.origin))
  }

  // next 는 safeRedirectTarget 을 지난 앱 내부 경로다.
  return NextResponse.redirect(new URL(next, url.origin))
}
