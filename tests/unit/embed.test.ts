import { describe, expect, it } from 'vitest'
import { buildEmbedUrl } from '@/lib/embed'

describe('buildEmbedUrl', () => {
  it('영상 ID로 임베드 경로를 만든다', () => {
    expect(buildEmbedUrl('abc123')).toContain('https://www.youtube.com/embed/abc123?')
  })

  it('모바일 자동재생에 필요한 파라미터를 넣는다', () => {
    const params = new URL(buildEmbedUrl('abc123')).searchParams
    expect(params.get('autoplay')).toBe('1')
    expect(params.get('mute')).toBe('1')
    expect(params.get('playsinline')).toBe('1')
  })

  it('단일 영상 반복을 위해 playlist에 같은 ID를 넣는다', () => {
    const params = new URL(buildEmbedUrl('abc123')).searchParams
    expect(params.get('loop')).toBe('1')
    expect(params.get('playlist')).toBe('abc123')
  })

  it('추천 영상과 브랜딩을 줄인다', () => {
    const params = new URL(buildEmbedUrl('abc123')).searchParams
    expect(params.get('rel')).toBe('0')
    expect(params.get('modestbranding')).toBe('1')
  })
})
