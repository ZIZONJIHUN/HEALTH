import { describe, expect, it } from 'vitest'
import { safeRedirectTarget } from '@/features/account/redirectTarget'

/**
 * OAuth 콜백의 next 파라미터는 공격자가 URL 하나로 정할 수 있다.
 * 그대로 따르면 우리 도메인의 로그인 링크가 피싱 사이트로 사람을 보낸다.
 */
describe('safeRedirectTarget', () => {
  it('앱 내부 경로는 그대로 쓴다', () => {
    expect(safeRedirectTarget('/account')).toBe('/account')
    expect(safeRedirectTarget('/')).toBe('/')
    expect(safeRedirectTarget('/?q=스쿼트')).toBe('/?q=스쿼트')
    expect(safeRedirectTarget('/feed?q=런지&i=2')).toBe('/feed?q=런지&i=2')
  })

  it('절대 URL 을 거부한다', () => {
    expect(safeRedirectTarget('https://evil.test')).toBe('/account')
    expect(safeRedirectTarget('http://evil.test/path')).toBe('/account')
  })

  it('프로토콜 상대 URL 을 거부한다', () => {
    // //evil.test 는 브라우저가 https://evil.test 로 해석한다.
    // "/ 로 시작하는지"만 보는 검사를 통과해버리는 고전적인 구멍이다.
    expect(safeRedirectTarget('//evil.test')).toBe('/account')
    expect(safeRedirectTarget('//evil.test/path')).toBe('/account')
  })

  it('역슬래시 우회를 거부한다', () => {
    // 일부 브라우저가 \\ 를 // 로 정규화한다.
    expect(safeRedirectTarget('\\\\evil.test')).toBe('/account')
    expect(safeRedirectTarget('/\\evil.test')).toBe('/account')
  })

  it('스킴을 가진 값을 거부한다', () => {
    expect(safeRedirectTarget('javascript:alert(1)')).toBe('/account')
    expect(safeRedirectTarget('data:text/html,<script>')).toBe('/account')
    expect(safeRedirectTarget('mailto:a@b.c')).toBe('/account')
  })

  it('경로가 아닌 값을 거부한다', () => {
    expect(safeRedirectTarget('account')).toBe('/account')
    expect(safeRedirectTarget('')).toBe('/account')
    expect(safeRedirectTarget(null)).toBe('/account')
    expect(safeRedirectTarget(undefined)).toBe('/account')
  })

  it('앞뒤 공백과 제어문자에 속지 않는다', () => {
    // 브라우저는 URL 앞뒤의 공백·제어문자를 떼고 해석한다.
    expect(safeRedirectTarget('  //evil.test')).toBe('/account')
    expect(safeRedirectTarget('\n/\\evil.test')).toBe('/account')
    expect(safeRedirectTarget('  /account  ')).toBe('/account')
  })

  it('경로 안의 하이픈과 한글을 깎지 않는다', () => {
    // 앞뒤 정리 범위를 넓게 잡으면 정상 경로가 망가진다.
    expect(safeRedirectTarget('/feed?q=런지-2')).toBe('/feed?q=런지-2')
    expect(safeRedirectTarget('/?q=벤치-프레스')).toBe('/?q=벤치-프레스')
  })

  it('값 안쪽의 탭과 개행으로 프로토콜 상대 URL 을 되살릴 수 없다', () => {
    // 브라우저의 URL 파서는 값 어디에 있든 탭·개행·CR 을 들어낸다.
    // 가장자리만 다듬으면 슬래시 뒤에 개행을 끼운 값이 접두사 검사를 통과한 뒤
    // 프로토콜 상대 URL 로 되살아나 외부 호스트로 나간다 (실측 확인).
    expect(safeRedirectTarget('/\n/evil.test')).toBe('/account')
    expect(safeRedirectTarget('/\t/evil.test')).toBe('/account')
    expect(safeRedirectTarget('/\r/evil.test')).toBe('/account')
    expect(safeRedirectTarget('/\n\\evil.test')).toBe('/account')
    expect(safeRedirectTarget('/\t\t//evil.test')).toBe('/account')
    expect(safeRedirectTarget('/\n\n//evil.test')).toBe('/account')
  })

  it('파서가 들어내지 않는 문자는 경로로 남겨 둔다', () => {
    // 들어내는 것은 생 탭·LF·CR 뿐이다. NUL 과 퍼센트 인코딩된 개행은
    // 같은 오리진의 경로로 해석되므로 거부할 이유가 없다 (실측 확인).
    // 여기를 과하게 막으면 멀쩡한 경로가 /account 로 튕긴다.
    expect(safeRedirectTarget('/%0A//evil.test')).toBe('/%0A//evil.test')
  })

  it('안전한 경로는 정규화하지 않고 그대로 돌려준다', () => {
    // 파서가 돌려준 형태를 쓰면 한글 질의가 퍼센트 인코딩되어 나간다.
    expect(safeRedirectTarget('/?q=스쿼트')).toBe('/?q=스쿼트')
    expect(safeRedirectTarget('/feed?q=런지&i=2')).toBe('/feed?q=런지&i=2')
  })
})
