/** 검증을 통과하지 못한 값이 갈 곳. */
export const DEFAULT_REDIRECT = '/account'

/**
 * 같은 오리진인지 물어보기 위한 가상 기준점. 실제로 접속하지 않는다.
 * `.invalid` 는 예약 TLD라 어떤 네트워크 요청도 여기로 새지 않는다.
 */
const PROBE_ORIGIN = 'https://probe.invalid'

/**
 * URL 파서가 **값 어디에 있든** 제거하는 문자들 — 탭, 개행, 캐리지 리턴.
 *
 * 가장자리만 다듬으면 뚫린다. `/\n/evil.test` 는 `/` 로 시작하고 둘째 글자가
 * `/` 가 아니라서 접두사 검사를 통과하는데, 브라우저가 개행을 들어내면
 * `//evil.test` 가 되어 외부로 나간다 (실측: `new URL('/\n/evil.test', origin)`
 * 이 `https://evil.test/` 를 돌려준다).
 */
const URL_DROPS = /[\t\n\r]/g

/**
 * 앞뒤의 공백류와 제어문자를 떼어낸다. 브라우저도 URL 을 해석하기 전에 같은 일을
 * 한다.
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
 * 검사는 두 겹이다.
 *
 * 1. 손으로 거른다: `/` 로 시작하되 `//` 나 `/\` 로 시작하지 않을 것.
 *    (`//evil.test` 는 프로토콜 상대 URL, `/\evil.test` 는 일부 브라우저가
 *    `//` 로 정규화한다.)
 * 2. **파서에게 다시 물어본다**: 가상 오리진에 붙여 해석했을 때 그 오리진을
 *    벗어나지 않을 것.
 *
 * 2번이 있어야 하는 이유는 파서의 규칙을 손으로 베껴 적는 일이 번번이 틀리기
 * 때문이다. 같은 판정을 내리는 주체에게 직접 묻는 편이 안전하다.
 * 돌려주는 값은 파서가 정규화한 형태가 아니라 정리된 입력 그대로다 —
 * `/?q=스쿼트` 가 퍼센트 인코딩되어 돌아오지 않게 한다.
 */
export function safeRedirectTarget(raw: string | null | undefined): string {
  if (!raw) return DEFAULT_REDIRECT

  const value = stripEdges(raw.replace(URL_DROPS, ''))

  if (!value.startsWith('/')) return DEFAULT_REDIRECT
  if (value.startsWith('//') || value.startsWith('/\\')) return DEFAULT_REDIRECT

  try {
    if (new URL(value, PROBE_ORIGIN).origin !== PROBE_ORIGIN) return DEFAULT_REDIRECT
  } catch {
    return DEFAULT_REDIRECT
  }

  return value
}
