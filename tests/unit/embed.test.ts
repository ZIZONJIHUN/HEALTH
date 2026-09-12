import { describe, expect, it } from 'vitest'
import { buildEmbedUrl } from '@/features/feed/embed'

describe('buildEmbedUrl', () => {
  it('영상 ID로 임베드 경로를 만든다', () => {
    expect(buildEmbedUrl('abc123', { autoplay: true })).toContain(
      'https://www.youtube.com/embed/abc123?',
    )
  })

  it('모바일 자동재생에 필요한 파라미터를 넣는다', () => {
    const params = new URL(buildEmbedUrl('abc123', { autoplay: true })).searchParams
    expect(params.get('autoplay')).toBe('1')
    expect(params.get('mute')).toBe('1')
    expect(params.get('playsinline')).toBe('1')
  })

  it('단일 영상 반복을 위해 playlist에 같은 ID를 넣는다', () => {
    const params = new URL(buildEmbedUrl('abc123', { autoplay: true })).searchParams
    expect(params.get('loop')).toBe('1')
    expect(params.get('playlist')).toBe('abc123')
  })

  it('추천 영상과 브랜딩을 줄인다', () => {
    const params = new URL(buildEmbedUrl('abc123', { autoplay: true })).searchParams
    expect(params.get('rel')).toBe('0')
    expect(params.get('modestbranding')).toBe('1')
  })

  it('autoplay: false면 자동재생 파라미터를 끈다', () => {
    const params = new URL(buildEmbedUrl('abc123', { autoplay: false })).searchParams
    expect(params.get('autoplay')).toBe('0')
  })
})

describe('buildEmbedUrl 옵션', () => {
  it('loop: false 면 반복을 끈다', () => {
    // 피드는 반복을 끈다. loop=1 이면 영상이 끝나지 않아 "다음으로 해보세요"를
    // 띄울 시점이 아예 없다.
    const params = new URL(buildEmbedUrl('abc123', { autoplay: true, loop: false })).searchParams
    expect(params.get('loop')).toBe('0')
  })

  it('enableJsApi 를 켜야 상태 이벤트를 받을 수 있다', () => {
    const off = new URL(buildEmbedUrl('abc123', { autoplay: true })).searchParams
    expect(off.get('enablejsapi')).toBeNull()

    const on = new URL(buildEmbedUrl('abc123', { autoplay: true, enableJsApi: true })).searchParams
    expect(on.get('enablejsapi')).toBe('1')
  })

  it('origin 파라미터는 넣지 않는다', () => {
    // 서버 렌더에는 window 가 없어 URL 이 클라이언트와 달라지고 iframe src
    // 하이드레이션 불일치가 난다. 대신 메시지를 받을 때 origin 을 확인한다.
    const params = new URL(buildEmbedUrl('abc123', { autoplay: true, enableJsApi: true }))
      .searchParams
    expect(params.get('origin')).toBeNull()
  })
})
