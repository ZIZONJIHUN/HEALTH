import { describe, expect, it } from 'vitest'
import thumbnailLoader from '@/lib/thumbnailLoader'

const HQ = 'https://i.ytimg.com/vi/abc-123_x/hqdefault.jpg'

describe('thumbnailLoader', () => {
  it('작은 요청에는 작은 변형을 준다', () => {
    // 루틴 목록의 36px 썸네일이 480px 원본을 받던 것이 이 로더를 만든 이유 중 하나다.
    expect(thumbnailLoader({ src: HQ, width: 100 })).toContain('/default.jpg')
    expect(thumbnailLoader({ src: HQ, width: 300 })).toContain('/mqdefault.jpg')
  })

  it('큰 요청에는 hqdefault 로 멈춘다', () => {
    // sddefault/maxresdefault 는 모든 영상에 있지 않다. 골랐다가 404 나면 빈 칸이 된다.
    expect(thumbnailLoader({ src: HQ, width: 480 })).toContain('/hqdefault.jpg')
    expect(thumbnailLoader({ src: HQ, width: 4000 })).toContain('/hqdefault.jpg')
  })

  it('영상 ID를 그대로 옮긴다', () => {
    // ID에는 하이픈과 밑줄이 들어간다. 정규식이 이를 놓치면 전부 패스스루가 된다.
    expect(thumbnailLoader({ src: HQ, width: 480 })).toBe(
      'https://i.ytimg.com/vi/abc-123_x/hqdefault.jpg',
    )
  })

  it('어떤 크기를 요청해도 i.ytimg.com 을 벗어나지 않는다', () => {
    for (const width of [1, 120, 121, 320, 321, 480, 9999]) {
      expect(thumbnailLoader({ src: HQ, width })).toMatch(
        /^https:\/\/i\.ytimg\.com\/vi\/abc-123_x\/\w+\.jpg$/,
      )
    }
  })

  it('YouTube 썸네일이 아니면 손대지 않는다', () => {
    // 전역 로더라 나중에 추가될 로컬 이미지도 여기를 지나간다.
    expect(thumbnailLoader({ src: '/logo.png', width: 200 })).toBe('/logo.png')
    expect(thumbnailLoader({ src: 'https://example.com/a.jpg', width: 200 })).toBe(
      'https://example.com/a.jpg',
    )
    // 호스트가 비슷해 보여도 통과시키지 않는다.
    const lookalike = 'https://i.ytimg.com.evil.test/vi/abc/hqdefault.jpg'
    expect(thumbnailLoader({ src: lookalike, width: 200 })).toBe(lookalike)
  })
})
