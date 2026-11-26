import type { NextConfig } from 'next'

/**
 * 이 앱이 실제로 의존하는 외부 출처는 넷뿐이다.
 * - YouTube 임베드 iframe (재생)
 * - i.ytimg.com 썸네일 (그리드·피드)
 * - Supabase (로그인) — 설정됐을 때만
 * - 나머지는 전부 자가호스팅 (폰트, 3D 모델)
 *
 * CSP 는 그 넷만 허용한다.
 */

/**
 * Supabase 오리진만 추출한다. 브라우저 Supabase 클라이언트가 이 주소로 XHR 을 보낸다.
 *
 * `*.supabase.co` 처럼 와일드카드로 열지 않는다 — 남의 Supabase 프로젝트까지
 * 허용할 이유가 없다. 주소가 없거나 망가졌으면 아무것도 추가하지 않는다.
 * 그 환경에서는 로그인 버튼이 비활성이라 XHR 이 나가지 않는다.
 */
function supabaseOrigin(rawUrl: string | undefined): string | null {
  if (!rawUrl) return null
  try {
    return new URL(rawUrl).origin
  } catch {
    return null
  }
}

/**
 * 이 앱을 iframe 으로 넣어도 되는 곳. 자기 자신과 Lectio 모닥불(작품 게시판)만 열고
 * 나머지 사이트는 계속 막는다 (클릭재킹 차단).
 */
export const FRAME_ANCESTORS = "frame-ancestors 'self' https://lectio.kr https://lectio.co.kr"

export function buildCsp(supabaseUrl: string | undefined): string {
  const origin = supabaseOrigin(supabaseUrl)

  return [
    "default-src 'self'",
    "img-src 'self' https://i.ytimg.com data: blob:",
    'frame-src https://www.youtube.com https://www.youtube-nocookie.com',
    "font-src 'self'",
    // 브라우저 Supabase 클라이언트가 여기로 XHR 을 보낸다. 빠지면 로그인이 죽는다.
    `connect-src 'self'${origin ? ` ${origin}` : ''}`,
    // Tailwind 가 만드는 인라인 스타일과 컴포넌트의 style 속성 때문에 필요하다.
    "style-src 'self' 'unsafe-inline'",
    // 'unsafe-inline' 은 Next 의 하이드레이션 인라인 스크립트 때문에 필요하다.
    // nonce 로 좁히려면 요청마다 생성해 넘겨야 하고, 그러면 모든 페이지가 동적이 되어
    // 캐싱과 충돌한다.
    // 'unsafe-eval' 은 넣지 않는다 — 3D 모델(three)과 하이드레이션 모두 없이 동작하는
    // 것을 확인했다. eval 계열을 막아 두면 CSP 가 실제로 값을 하는 몇 안 되는 지점이다.
    "script-src 'self' 'unsafe-inline'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    FRAME_ANCESTORS,
  ].join('; ')
}

const nextConfig: NextConfig = {
  images: {
    /*
      이 앱의 이미지는 전부 YouTube 썸네일이고 이미 최적화된 고정 크기 JPEG 다.
      Next 이미지 최적화를 거치면 재인코딩으로 얻는 것 없이 지연과 과금만 는다.
      로더가 YouTube 의 크기별 변형을 직접 고른다 (src/lib/thumbnailLoader.ts).

      loader: 'custom' 이면 최적화 서버를 타지 않으므로 remotePatterns 는 더 이상
      쓰이지 않는다. 남겨두면 "허용 목록이 지키고 있다"는 착각을 준다.
    */
    loader: 'custom',
    loaderFile: './src/lib/thumbnailLoader.ts',
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          /*
            Report-Only 로 시작한다. 강제 모드로 바로 켜면 무엇이 깨지는지 모른 채
            화면이 죽는다 — 특히 script-src 는 Next 의 하이드레이션 방식에 달려 있어
            버전이 올라갈 때마다 달라질 수 있다.

            배포 후 브라우저 콘솔의 위반 보고가 정리되면 헤더 이름에서
            `-Report-Only` 를 떼어 강제로 올린다.
          */
          {
            key: 'Content-Security-Policy-Report-Only',
            value: buildCsp(process.env.NEXT_PUBLIC_SUPABASE_URL),
          },

          // 아래 넷은 부작용이 없어 처음부터 강제한다.
          // iframe 은 FRAME_ANCESTORS 에 적은 곳에서만 열린다. X-Frame-Options 는 허용할 곳을
          // 적을 수 없어 쓰지 않는다 (DENY 면 Lectio 모닥불에서도 화면이 막힌다).
          { key: 'Content-Security-Policy', value: FRAME_ANCESTORS },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
          },
        ],
      },
    ]
  },
}

export default nextConfig
