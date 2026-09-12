import { useEffect, useRef, type RefObject } from 'react'

/**
 * YouTube 임베드가 끝났는지 감지한다.
 *
 * 공식 IFrame Player API(YT.Player) 대신 그 API 가 내부에서 쓰는 postMessage 규약을
 * 직접 쓴다. YT.Player 는 destroy() 가 iframe 을 DOM 에서 들어내기 때문에 React 가
 * 관리하는 노드와 충돌하고, 안 부르면 슬라이드를 넘길 때마다 플레이어가 쌓인다.
 * 여기서는 window 이벤트 리스너 하나만 붙였다 떼면 된다.
 *
 * 이 감지는 실패할 수 있다(브라우저 정책, 규약 변경). 그래서 루틴 화면에는 항상
 * "다음 운동" 버튼을 함께 둔다 — 자동 감지는 편의이지 유일한 경로가 아니다.
 */

const YOUTUBE_ORIGIN = 'https://www.youtube.com'
const ENDED = 0
/** 아직 안 뜬 iframe 에 대비해 몇 번 더 신청한다. 응답이 오면 그만한다. */
const HANDSHAKE_TRIES = 12
const HANDSHAKE_INTERVAL_MS = 500

/**
 * 받은 메시지를 어떻게 다룰지.
 * - `foreign`: 우리 것이 아니다. 무시한다.
 * - `other-player`: YouTube 가 보냈지만 다른 슬라이드의 플레이어다.
 * - `ack`: 우리 플레이어가 응답했다. 핸드셰이크를 멈춰도 된다.
 * - `ended`: 우리 플레이어의 영상이 끝났다.
 */
export type PlayerMessage = 'foreign' | 'other-player' | 'ack' | 'ended'

/**
 * window 메시지 하나를 판정한다.
 *
 * 훅 밖으로 뺀 이유는 **여기가 보안 경계**이기 때문이다. window 의 message 이벤트는
 * 아무 프레임이나 보낼 수 있고, origin 검사가 유일한 방어막이다 (보내는 쪽은
 * targetOrigin '*' 를 쓴다 — 임베드가 youtube.com 과 youtube-nocookie.com 중 어디로도
 * 갈 수 있고 내보내는 내용은 비밀이 아니라서 그쪽은 문제가 아니다).
 *
 * 훅 안에 두면 이 검사가 사라져도 어떤 테스트도 깨지지 않는다.
 */
export function readPlayerMessage(
  origin: string,
  data: unknown,
  playerId: string,
): PlayerMessage {
  if (origin !== YOUTUBE_ORIGIN) return 'foreign'

  let payload: { id?: string; event?: string; info?: { playerState?: number } }
  try {
    payload = typeof data === 'string' ? JSON.parse(data) : (data as typeof payload)
  } catch {
    return 'foreign'
  }
  if (payload?.id !== playerId) return 'other-player'

  const ended = payload.event === 'infoDelivery' && payload.info?.playerState === ENDED
  return ended ? 'ended' : 'ack'
}

export function useVideoEnded(
  iframeRef: RefObject<HTMLIFrameElement | null>,
  active: boolean,
  onEnded: (() => void) | undefined,
): void {
  const onEndedRef = useRef(onEnded)

  useEffect(() => {
    onEndedRef.current = onEnded
  }, [onEnded])

  useEffect(() => {
    if (!active || !onEnded) return
    const iframe = iframeRef.current
    if (!iframe) return

    const playerId = `feed-${Math.random().toString(36).slice(2)}`
    let tries = 0
    let acknowledged = false

    function requestUpdates() {
      // targetOrigin 을 '*' 로 둔다. 임베드는 youtube.com 과 youtube-nocookie.com 중
      // 어디로도 갈 수 있고, 여기서 나가는 내용은 비밀이 아니다.
      // 받을 때 origin 을 확인하는 쪽이 실제 보호막이다.
      iframe?.contentWindow?.postMessage(
        JSON.stringify({ event: 'listening', id: playerId, channel: 'widget' }),
        '*',
      )
    }

    function onMessage(event: MessageEvent) {
      const verdict = readPlayerMessage(event.origin, event.data, playerId)
      if (verdict === 'foreign' || verdict === 'other-player') return

      acknowledged = true
      if (verdict === 'ended') onEndedRef.current?.()
    }

    window.addEventListener('message', onMessage)
    requestUpdates()
    const timer = setInterval(() => {
      tries += 1
      if (acknowledged || tries >= HANDSHAKE_TRIES) {
        clearInterval(timer)
        return
      }
      requestUpdates()
    }, HANDSHAKE_INTERVAL_MS)

    return () => {
      clearInterval(timer)
      window.removeEventListener('message', onMessage)
    }
  }, [active, onEnded, iframeRef])
}
