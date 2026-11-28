'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { BUTTON_SECONDARY } from '@/components/ui/Button'
import { ICON_WEIGHT, Timer } from '@/components/ui/icons'
import { formatRest, REST } from '@/features/routines/rest'
import { adjustRest, remaining, startRest, type RestRun } from '@/features/routines/restTimer'

/** 다시 그리는 간격. 1초로 하면 시작 시점에 따라 숫자가 최대 1초 늦게 바뀌어 보인다. */
const TICK_MS = 250
/** "휴식 끝"을 보여주는 시간. 소리·진동을 못 받은 사람도 화면으로 알아챌 만큼만. */
const DONE_MS = 2000
const BEEP_SECONDS = 0.2

type AudioContextCtor = typeof AudioContext

function audioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null
  // 옛 사파리는 접두사 붙은 이름만 있다.
  const w = window as unknown as {
    AudioContext?: AudioContextCtor
    webkitAudioContext?: AudioContextCtor
  }
  return w.AudioContext ?? w.webkitAudioContext ?? null
}

function beep(ctx: AudioContext | null) {
  if (!ctx) return
  try {
    // 백그라운드에 있다 돌아오면 브라우저가 컨텍스트를 멈춰 뒀을 수 있다.
    void ctx.resume()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = 880
    gain.gain.value = 0.2
    osc.connect(gain).connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + BEEP_SECONDS)
  } catch {
    // 소리는 덤이다. 실패해도 화면의 "휴식 끝"은 그대로 뜬다.
  }
}

/**
 * 휴식 한 번의 상태. ShortsFeed 수준에서 부른다 — 슬라이드를 넘겨도(다음 운동 영상을
 * 미리 보는 흔한 동작) 휴식이 끊기면 안 되기 때문이다. 슬라이드 안에 두면 넘기는 순간
 * 언마운트되어 사라진다.
 */
export function useRestRun() {
  const [run, setRun] = useState<RestRun | null>(null)
  const [finished, setFinished] = useState(false)
  const audioRef = useRef<AudioContext | null>(null)
  /*
    끝 알림은 run 하나에 한 번. 상태가 아니라 ref 로 막는 이유: 패널의 틱이 상태 갱신 전에
    한 번 더 돌 수 있고, 그러면 비프가 두 번 울린다.
  */
  const elapsedRef = useRef(false)

  const closeAudio = useCallback(() => {
    const ctx = audioRef.current
    audioRef.current = null
    if (ctx) void ctx.close().catch(() => {})
  }, [])

  const clear = useCallback(() => {
    elapsedRef.current = false
    setRun(null)
    setFinished(false)
    closeAudio()
  }, [closeAudio])

  /**
   * 반드시 클릭 핸들러에서 부른다. 모바일 브라우저는 사용자 동작 안에서 만든
   * AudioContext 만 소리를 내게 해 준다 — 끝나는 순간에 만들면 비프가 막힌다.
   * 쉬는 중에 다시 누르면 지금 슬라이드의 값으로 처음부터 다시 센다.
   */
  const start = useCallback((seconds: number) => {
    if (!audioRef.current) {
      const Ctor = audioContextCtor()
      try {
        audioRef.current = Ctor ? new Ctor() : null
      } catch {
        audioRef.current = null
      }
    }
    elapsedRef.current = false
    setFinished(false)
    setRun(startRest(seconds, Date.now()))
  }, [])

  // 재생 중 조절은 이번 휴식에만 쓴다. 루틴에 저장된 값은 루틴 화면에서만 바꾼다.
  const adjust = useCallback((delta: number) => {
    setRun((current) => (current ? adjustRest(current, delta, Date.now()) : current))
  }, [])

  const elapse = useCallback(() => {
    if (elapsedRef.current) return
    elapsedRef.current = true
    beep(audioRef.current)
    navigator.vibrate?.(200)
    setFinished(true)
  }, [])

  useEffect(() => {
    if (!finished) return
    const timer = setTimeout(clear, DONE_MS)
    return () => clearTimeout(timer)
  }, [finished, clear])

  // 루틴 화면을 떠나면 컨텍스트를 닫는다. 열어 두면 브라우저가 오디오 장치를 계속 잡는다.
  useEffect(() => closeAudio, [closeAudio])

  return { run, finished, start, adjust, skip: clear, elapse }
}

/** 90 → "1:30". 큰 숫자 하나로 읽혀야 해서 formatRest 의 "1분 30초" 대신 쓴다. */
function clock(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function StartRestButton({ seconds, onStart }: { seconds: number; onStart: () => void }) {
  return (
    <button
      type="button"
      data-testid="start-rest"
      onClick={onStart}
      className={`pointer-events-auto ${BUTTON_SECONDARY}`}
    >
      <Timer size={15} weight={ICON_WEIGHT} aria-hidden />
      휴식 시작 · {formatRest(seconds)}
    </button>
  )
}

/**
 * 쉬는 동안 뜨는 패널. 남은 초를 직접 세지 않고 끝나는 시각과 지금 시각의 차이를
 * 그때그때 계산한다(restTimer.ts 주석 참고). 그래서 다른 탭에 갔다 와도 맞다.
 */
export function RestPanel({
  run,
  finished,
  onAdjust,
  onSkip,
  onElapsed,
}: {
  run: RestRun
  finished: boolean
  onAdjust: (delta: number) => void
  onSkip: () => void
  onElapsed: () => void
}) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (finished) return
    const tick = () => {
      const at = Date.now()
      setNow(at)
      if (remaining(run, at) === 0) onElapsed()
    }
    // 새 run(시작·조절) 직후에도 한 박자 늦지 않게 바로 한 번 센다.
    const first = setTimeout(tick, 0)
    const timer = setInterval(tick, TICK_MS)
    return () => {
      clearTimeout(first)
      clearInterval(timer)
    }
  }, [run, finished, onElapsed])

  const left = remaining(run, now)

  return (
    <div
      data-testid="rest-panel"
      role="timer"
      aria-label="휴식 타이머"
      className="pointer-events-auto w-full rounded-2xl border border-white/10 bg-black/70 p-4 backdrop-blur-md"
    >
      {finished ? (
        <p role="status" className="py-3 text-center text-2xl font-bold text-accent">
          휴식 끝
        </p>
      ) : (
        <>
          <p className="tabular text-center text-5xl font-bold tracking-tight text-text">
            {clock(left)}
          </p>
          <div className="mt-3 flex justify-center gap-2">
            <button
              type="button"
              onClick={() => onAdjust(-REST.step)}
              disabled={left <= REST.min}
              className={`${BUTTON_SECONDARY} disabled:opacity-30`}
            >
              −10초
            </button>
            <button
              type="button"
              onClick={() => onAdjust(REST.step)}
              disabled={left >= REST.max}
              className={`${BUTTON_SECONDARY} disabled:opacity-30`}
            >
              +10초
            </button>
            <button type="button" onClick={onSkip} className={BUTTON_SECONDARY}>
              건너뛰기
            </button>
          </div>
        </>
      )}
    </div>
  )
}
