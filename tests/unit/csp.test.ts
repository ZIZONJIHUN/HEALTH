import { describe, expect, it } from 'vitest'
import { buildCsp } from '../../next.config'

function directive(csp: string, name: string): string {
  const found = csp.split('; ').find((part) => part.startsWith(`${name} `))
  return found ?? ''
}

describe('buildCsp', () => {
  it('Supabase 주소가 있으면 connect-src 에 그 오리진만 넣는다', () => {
    const csp = buildCsp('https://abcd.supabase.co')

    expect(directive(csp, 'connect-src')).toBe("connect-src 'self' https://abcd.supabase.co")
  })

  it('경로가 붙어 있어도 오리진만 쓴다', () => {
    const csp = buildCsp('https://abcd.supabase.co/rest/v1')

    expect(directive(csp, 'connect-src')).toBe("connect-src 'self' https://abcd.supabase.co")
  })

  it('와일드카드로 열지 않는다', () => {
    // *.supabase.co 로 열면 남의 프로젝트까지 허용된다.
    expect(buildCsp('https://abcd.supabase.co')).not.toContain('*.supabase.co')
  })

  it('주소가 없으면 self 만 남는다', () => {
    // 로컬·E2E 기본값이다. 그 환경에서는 로그인 버튼이 비활성이라 XHR 이 나가지 않는다.
    expect(directive(buildCsp(undefined), 'connect-src')).toBe("connect-src 'self'")
    expect(directive(buildCsp(''), 'connect-src')).toBe("connect-src 'self'")
  })

  it('망가진 주소에 죽지 않는다', () => {
    expect(directive(buildCsp('not a url'), 'connect-src')).toBe("connect-src 'self'")
  })

  it('기존 지시어를 유지한다', () => {
    const csp = buildCsp(undefined)

    expect(csp).toContain("frame-ancestors 'self' https://lectio.kr https://torch.ai.kr https://lectio.co.kr")
    expect(csp).toContain('https://www.youtube.com')
    expect(csp).toContain('https://i.ytimg.com')
    expect(csp).not.toContain('unsafe-eval')
  })
})
