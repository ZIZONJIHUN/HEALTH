import type { NextConfig } from 'next'

/**
 * 이 앱이 실제로 의존하는 외부 출처는 셋뿐이다.
 * - YouTube 임베드 iframe (재생)
 * - i.ytimg.com 썸네일 (그리드·피드)
 * - 나머지는 전부 자가호스팅 (폰트, 3D 모델)
 *
 * CSP 는 그 셋만 허용한다.
 */
const CSP_DIRECTIVES = [
  "default-src 'self'",
  "img-src 'self' https://i.ytimg.com data: blob:",
  "frame-src https://www.youtube.com https://www.youtube-nocookie.com",
  "font-src 'self'",
  "connect-src 'self'",
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
  "frame-ancestors 'none'",
].join('; ')

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'i.ytimg.com' }],
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
          { key: 'Content-Security-Policy-Report-Only', value: CSP_DIRECTIVES },

          // 아래 넷은 부작용이 없어 처음부터 강제한다.
          // 이 앱은 어떤 화면도 iframe 안에서 쓰일 일이 없다 (클릭재킹 차단).
          { key: 'X-Frame-Options', value: 'DENY' },
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
