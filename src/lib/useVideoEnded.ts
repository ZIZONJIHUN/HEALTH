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
      iframe?.contentWindow?.postMessage(
        JSON.stringify({ event: 'listening', id: playerId, channel: 'widget' }),
        YOUTUBE_ORIGIN,
      )
    }

    function onMessage(event: MessageEvent) {
      if (event.origin !== YOUTUBE_ORIGIN) return

      let payload: { id?: string; event?: string; info?: { playerState?: number } }
      try {
        payload = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
      } catch {
        return
      }
      if (payload?.id !== playerId) return

      acknowledged = true
      if (payload.event === 'infoDelivery' && payload.info?.playerState === ENDED) {
        onEndedRef.current?.()
      }
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
