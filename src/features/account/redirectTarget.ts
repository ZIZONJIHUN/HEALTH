/** 검증을 통과하지 못한 값이 갈 곳. */
export const DEFAULT_REDIRECT = '/account'

/**
 * 앞뒤의 공백류와 제어문자를 떼어낸다. 브라우저도 URL 을 해석하기 전에 같은 일을
 * 하므로, 여기서 먼저 떼지 않으면 "  //evil.test" 가 검사를 통과한다.
 *
 * 정규식 대신 코드 단위 비교를 쓴다. `c <= ' '` 는 0x00~0x20, 즉 공백류와 C0
 * 제어문자를 정확히 덮는다. 문자 클래스에 제어문자 이스케이프를 적는 방식은
 * 범위를 잘못 잡기 쉽다 — 예컨대 하이픈까지 깎으면 `/feed?q=런지-2` 가 망가진다.
 */
function stripEdges(value: string): string {
  let start = 0
  let end = value.length
  while (start < end && value[start] <= ' ') start += 1
  while (end > start && value[end - 1] <= ' ') end -= 1
  return value.slice(start, end)
}

/**
 * OAuth 콜백의 `next` 파라미터를 앱 내부 경로로 좁힌다.
 *
 * 이 값은 공격자가 URL 하나로 정할 수 있다. 그대로 따르면 우리 도메인의 로그인
 * 링크가 피싱 사이트로 사람을 보낸다 — 사용자는 우리 도메인을 보고 눌렀으므로
 * 도착한 곳을 의심하지 않는다.
 *
 * 허용 조건은 하나다: `/` 로 시작하되 `//` 나 `/\` 로 시작하지 않을 것.
 * `//evil.test` 는 프로토콜 상대 URL 이라 외부로 나가고, `/\evil.test` 는 일부
 * 브라우저가 `//` 로 정규화한다.
 */
export function safeRedirectTarget(raw: string | null | undefined): string {
  if (!raw) return DEFAULT_REDIRECT

  const value = stripEdges(raw)

  if (!value.startsWith('/')) return DEFAULT_REDIRECT
  if (value.startsWith('//') || value.startsWith('/\\')) return DEFAULT_REDIRECT

  return value
}
