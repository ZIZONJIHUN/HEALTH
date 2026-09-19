/**
 * Supabase 공개 설정.
 *
 * URL 과 anon 키는 브라우저 번들에 들어가야 해서 NEXT_PUBLIC_ 접두사를 쓴다.
 * 공개돼도 안전하다 — anon 키로 할 수 있는 일은 RLS 가 정한 범위뿐이다.
 * (service_role 키는 다르다. 그건 RLS 를 우회하므로 절대 NEXT_PUBLIC_ 를 붙이지 않는다.)
 *
 * 한쪽만 있으면 null 을 돌려준다. 반쪽짜리 설정으로 클라이언트를 만들면
 * 실패 지점이 런타임 깊숙한 곳으로 밀려난다.
 */
export function supabasePublicConfig(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) return null
  return { url, anonKey }
}
