import { REST } from '@/features/routines/rest'

/**
 * 진행 중인 휴식 한 번. 남은 초가 아니라 끝나는 시각을 든다 — 탭이 백그라운드로 가면
 * 브라우저가 타이머를 늦추거나 멈춰서, 1초씩 빼는 방식은 돌아왔을 때 어긋난다.
 * 끝나는 시각을 들고 있으면 언제 다시 그려도 Date.now() 와의 차이가 곧 정답이다.
 */
export type RestRun = { endsAt: number; total: number }

export function startRest(seconds: number, now: number): RestRun {
  return { endsAt: now + seconds * 1000, total: seconds }
}

/** 남은 초. 1초라도 남았으면 1로 보이게 올림하고, 지났으면 0. */
export function remaining(run: RestRun, now: number): number {
  return Math.max(0, Math.ceil((run.endsAt - now) / 1000))
}

/**
 * 진행 중 ±10초. 저장하지 않고 이번 휴식에만 쓴다.
 * 줄일 때는 10초 아래로 내려가지 않게 멈추고(이미 10초 미만이면 그대로 둔다),
 * 늘릴 때는 300초를 넘기지 않는다. 범위 밖으로 끌려가는 대신 경계에서 멈추는 쪽이
 * 손가락으로 연타할 때 덜 놀랍다.
 */
export function adjustRest(run: RestRun, deltaSeconds: number, now: number): RestRun {
  const left = remaining(run, now)
  let next = left + deltaSeconds
  next = Math.max(next, Math.min(left, REST.min))
  next = Math.min(next, Math.max(left, REST.max))
  const change = next - left
  if (change === 0) return run
  return { endsAt: run.endsAt + change * 1000, total: run.total + change }
}
