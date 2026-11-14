import type { WorkoutLog } from '@/features/workouts/workouts'
import type { StoredRoutine } from './routines'
import type { PushResult } from './routineSync'

/**
 * 동기화 컨트롤러가 내리는 판단들. 전부 순수 함수다.
 *
 * 컨트롤러(SyncController.tsx)는 인증 이벤트·타이머·네트워크를 잇는 배선만 하고, "무엇을
 * 올리나 / 결과를 어떻게 반영하나 / 언제 다시 하나" 는 여기서 정한다. 배선은 브라우저와
 * Supabase 없이 테스트하기 어렵지만 이 판단들은 그럴 필요가 없다 — 데이터를 잃거나 섞는
 * 실수는 대부분 여기서 난다.
 */

/** 실패한 뒤 다시 시도할 간격. 오프라인에서 요청을 쏟아붓지 않으면서 금방 회복한다. */
export const RETRY_DELAYS_MS = [5_000, 15_000, 60_000] as const

export function retryDelay(attempt: number): number {
  return RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)]
}

/** 포커스가 돌아올 때 다시 당기는 최소 간격. 탭을 오갈 때마다 두 표를 통째로 읽지 않게. */
export const PULL_STALE_MS = 30_000

export function shouldPullOnFocus(lastPullAt: number | null, now: number): boolean {
  return lastPullAt === null || now - lastPullAt >= PULL_STALE_MS
}

/**
 * 올릴 루틴과 그 position. position 은 이 주인의 루틴(묘비 포함) 사이에서의 순서다 — 다른
 * 주인·손님 루틴이 끼어 있어도 서버의 순서는 이 계정의 것만으로 매긴다.
 * syncError 가 있는 루틴은 뺀다. 표가 거절한 것은 다시 보내도 같은 거절이라 매번 같은 요청을
 * 보내며 돈다. 사용자가 고치면 routines.ts 가 syncError 를 지우므로 그때 다시 올라간다.
 */
export function routinesToPush(
  stored: StoredRoutine[],
  owner: string,
): { routine: StoredRoutine; position: number }[] {
  return stored
    .filter((routine) => routine.owner === owner)
    .map((routine, position) => ({ routine, position }))
    .filter(({ routine }) => routine.dirty && routine.syncError === null)
}

export function workoutsToPush(stored: WorkoutLog[], owner: string): WorkoutLog[] {
  return stored.filter((log) => log.owner === owner && log.dirty)
}

/** 저장소가 바뀌었을 때 밀기를 예약할지. 밀 것이 없으면 요청도 타이머도 만들지 않는다. */
export function hasPendingPush(
  routines: StoredRoutine[],
  workouts: WorkoutLog[],
  owner: string,
): boolean {
  return routinesToPush(routines, owner).length > 0 || workoutsToPush(workouts, owner).length > 0
}

/** 올린 그 판(版)이 아직 저장소에 그대로 있는가. */
function sameVersion(a: StoredRoutine, b: StoredRoutine): boolean {
  return (
    a.owner === b.owner &&
    a.updatedAt === b.updatedAt &&
    a.deletedAt === b.deletedAt &&
    a.name === b.name &&
    JSON.stringify(a.items) === JSON.stringify(b.items)
  )
}

/**
 * 루틴 하나를 민 결과를 저장소에 반영한다. 바뀐 것이 없으면 같은 참조를 돌려준다.
 *
 * 요청이 오가는 동안 사용자가 같은 루틴을 다시 고쳤을 수 있다. 그때 ok 로 dirty 를 끄면 새
 * 변경이 영영 올라가지 않고, rejected 를 붙이면 이미 고친 내용에 지난 거절이 남는다. 그래서
 * 올린 판이 그대로 있을 때만 반영한다 — 아니면 새 판이 dirty 로 남아 다음 밀기가 올린다.
 */
export function applyRoutinePush(
  stored: StoredRoutine[],
  pushed: StoredRoutine,
  result: PushResult,
): StoredRoutine[] {
  if (!result.ok && result.kind === 'transient') return stored
  const index = stored.findIndex((routine) => routine.id === pushed.id)
  if (index === -1 || !sameVersion(stored[index], pushed)) return stored

  const next = stored.slice()
  next[index] = result.ok
    ? { ...stored[index], dirty: false, syncError: null }
    : { ...stored[index], dirty: true, syncError: result.reason }
  return next
}

/**
 * 기록 하나를 민 결과를 반영한다. 바뀐 것이 없으면 같은 참조를 돌려준다.
 *
 * rejected 는 기록을 지운다(하루 상한 등). dirty 만 끄면 다음 당기기의 mergeWorkouts 가 "서버에
 * 없는 로컬 기록" 으로 보고 다시 dirty 로 만들어 거절 → 재전송을 끝없이 돈다. 상한에 걸린 기록은
 * 애초에 기록하지 않는다는 규칙(설계 5.3)과도 맞는다. 그래서 기록에는 rejected 상태가 없다.
 */
export function applyWorkoutPush(
  stored: WorkoutLog[],
  pushed: WorkoutLog,
  result: PushResult,
): WorkoutLog[] {
  if (!result.ok && result.kind === 'transient') return stored
  const index = stored.findIndex((log) => log.id === pushed.id && log.owner === pushed.owner)
  if (index === -1) return stored

  if (!result.ok) return stored.filter((_, i) => i !== index)
  const next = stored.slice()
  next[index] = { ...stored[index], dirty: false }
  return next
}

/**
 * 손님 루틴·기록을 가져올지 묻는 문구. 물을 것이 없으면 null.
 * 손님 묘비는 세지 않는다 — adoptGuestRoutines 가 버리는 것이라 "N개" 에 넣으면 숫자가 어긋난다.
 * 루틴이 있으면 루틴 개수로 묻는다. 가져오기는 기록도 함께 가져온다.
 */
export function guestPrompt(routines: StoredRoutine[], workouts: WorkoutLog[]): string | null {
  const routineCount = routines.filter((r) => r.owner === null && r.deletedAt === null).length
  const workoutCount = workouts.filter((log) => log.owner === null).length
  const what =
    routineCount > 0 ? `루틴 ${routineCount}개` : workoutCount > 0 ? `운동 기록 ${workoutCount}개` : null
  if (what === null) return null
  return `로그인 전에 이 브라우저에서 만든 ${what}가 있어요. 내 계정으로 가져올까요?`
}
