import { describe, expect, it } from 'vitest'
import { readPlayerMessage } from '@/lib/useVideoEnded'

/**
 * window 의 message 이벤트는 아무 프레임이나 보낼 수 있다. origin 검사가 유일한
 * 방어막이라 이 파일이 그 검사를 지키는 유일한 장치다.
 */

const ME = 'feed-abc'
const YOUTUBE = 'https://www.youtube.com'

function endedFrom(id: string): string {
  return JSON.stringify({ id, event: 'infoDelivery', info: { playerState: 0 } })
}

describe('readPlayerMessage', () => {
  it('YouTube가 보낸 종료 신호를 알아본다', () => {
    expect(readPlayerMessage(YOUTUBE, endedFrom(ME), ME)).toBe('ended')
  })

  it('다른 출처의 메시지는 내용이 같아도 무시한다', () => {
    // 이 단정이 깨지면 아무 페이지나 우리 피드를 넘길 수 있다.
    expect(readPlayerMessage('https://evil.test', endedFrom(ME), ME)).toBe('foreign')
    expect(readPlayerMessage('null', endedFrom(ME), ME)).toBe('foreign')
    expect(readPlayerMessage('', endedFrom(ME), ME)).toBe('foreign')
  })

  it('출처가 비슷해 보여도 정확히 일치해야 한다', () => {
    expect(readPlayerMessage('https://www.youtube.com.evil.test', endedFrom(ME), ME)).toBe(
      'foreign',
    )
    expect(readPlayerMessage('http://www.youtube.com', endedFrom(ME), ME)).toBe('foreign')
  })

  it('다른 슬라이드의 플레이어가 보낸 것은 넘긴다', () => {
    // 피드는 마운트 윈도우(±1)만큼 플레이어를 동시에 띄운다. 남의 종료 신호로
    // 화면을 넘기면 보고 있던 영상이 멋대로 바뀐다.
    expect(readPlayerMessage(YOUTUBE, endedFrom('feed-다른것'), ME)).toBe('other-player')
  })

  it('재생 중 신호는 종료가 아니지만 응답으로는 친다', () => {
    // 응답이 왔으면 핸드셰이크를 멈춰야 한다. 종료와는 구분한다.
    const playing = JSON.stringify({ id: ME, event: 'infoDelivery', info: { playerState: 1 } })
    expect(readPlayerMessage(YOUTUBE, playing, ME)).toBe('ack')
  })

  it('infoDelivery가 아닌 이벤트는 종료가 아니다', () => {
    const ready = JSON.stringify({ id: ME, event: 'onReady', info: { playerState: 0 } })
    expect(readPlayerMessage(YOUTUBE, ready, ME)).toBe('ack')
  })

  it('깨진 메시지에 죽지 않는다', () => {
    expect(readPlayerMessage(YOUTUBE, '{ JSON 이 아니다', ME)).toBe('foreign')
    expect(readPlayerMessage(YOUTUBE, undefined, ME)).toBe('other-player')
    expect(readPlayerMessage(YOUTUBE, null, ME)).toBe('other-player')
    expect(readPlayerMessage(YOUTUBE, 42, ME)).toBe('other-player')
  })

  it('문자열이 아닌 객체 페이로드도 받는다', () => {
    // 브라우저에 따라 구조화 복제된 객체가 그대로 온다.
    const asObject = { id: ME, event: 'infoDelivery', info: { playerState: 0 } }
    expect(readPlayerMessage(YOUTUBE, asObject, ME)).toBe('ended')
  })

  it('id가 없는 페이로드를 우리 것으로 착각하지 않는다', () => {
    const noId = JSON.stringify({ event: 'infoDelivery', info: { playerState: 0 } })
    expect(readPlayerMessage(YOUTUBE, noId, ME)).toBe('other-player')
  })
})
