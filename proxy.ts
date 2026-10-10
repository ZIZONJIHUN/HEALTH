import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Supabase 세션 갱신.
 *
 * 액세스 토큰은 1시간 만료다. 갱신이 없으면 사용자가 한 시간 뒤 조용히 로그아웃된다.
 * 서버 컴포넌트에서는 쿠키를 쓸 수 없으므로 갱신은 여기서만 가능하다.
 *
 * proxy 는 CDN 에 배포될 수 있어 공유 모듈이나 전역에 기대면 안 된다. 이 함수는
 * 요청의 쿠키만 다루므로 그 제약에 걸리지 않는다. 환경변수도 앱 모듈을 거치지 않고
 * 직접 읽는다.
 */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  // Supabase 미설정이면 할 일이 없다. 로컬 개발의 기본값이다.
  if (!url || !anonKey) return NextResponse.next({ request })

  let response = NextResponse.next({ request })

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value)
        }
        // 요청 쿠키를 갱신한 뒤 응답을 다시 만들어야 이번 렌더가 새 토큰을 본다.
        response = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options)
        }
      },
    },
  })

  /*
    반드시 불러야 한다. 이 호출이 만료된 토큰을 갱신하고 위 setAll 을 깨운다.

    비용을 알고 쓴다: **로그인한 사용자에게는 페이지 요청마다 Supabase 왕복이 한 번씩
    붙는다.** 토큰을 서버에서 검증하는 값이라 피할 수 없고, 피하려고 getSession() 으로
    바꾸면 쿠키를 그대로 믿는 셈이 되어 검증이 사라진다.

    비로그인 사용자에게는 인증 쿠키가 없어 세션 초기화 자체가 일어나지 않으므로
    (@supabase/ssr 의 지연 초기화) 네트워크를 타지 않는다. 익명 경로가 이 앱의 주된
    흐름이라 전체 비용은 크지 않다.
  */
  await supabase.auth.getUser()

  return response
}

/**
 * 정적 자산을 제외한다.
 *
 * 이 앱은 폰트 조각 92개(3.1MB)와 3D 모델(761KB)을 자가호스팅한다. 좁히지 않으면
 * 그것이 전부 proxy 를 지나간다.
 */
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|fonts/|models/).*)'],
}
