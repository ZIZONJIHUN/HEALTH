import type { WorkoutLog } from '@/features/workouts/workouts'
import type { StoredRoutine } from './routines'

/**
 * 루틴 병합과 세션 전환 판단. 전부 순수 함수다 — 저장소·네트워크를 모르기 때문에
 * 동기화 컨트롤러가 부르기 전에 규칙만 따로 검증할 수 있고, 입력은 바꾸지 않는다.
 */

/**
 * `owner` 의 로컬 루틴과 서버 루틴을 id 로 합친다.
 *
 * - 같은 id 는 updatedAt 이 큰 쪽이 이긴다. 같으면 서버가 이긴다 — 서버가 기준이어야
 *   같은 내용을 서로 다시 올리는 왕복이 생기지 않는다.
 * - 로컬이 이기면(updatedAt 이 더 크다 = 서버와 다르다) dirty 로 남겨 다음 동기화가 올리게
 *   한다. 서버에 없는 로컬 루틴도 같다. 지운 쪽이 이기면 묘비가 이기는 것이라 별도 규칙이 없다.
 * - 단, 서버에 없는 로컬 **묘비**가 dirty 가 아니면 버린다. 서버가 이미 받아 둔 묘비를 30일
 *   뒤 정리한 것이다. 다시 dirty 로 올리면 그 push 가 또 정리를 부르고, 다음 당기기에서 또
 *   없어져 다시 올리는 왕복이 끝없이 돈다. 아직 못 올린(dirty) 묘비는 남겨 올린다.
 * - 다른 주인(손님 포함)의 로컬 루틴은 이 계정의 일이 아니므로 그대로 둔다.
 * - 순서는 로컬을 유지하고, 서버에만 있는 것은 createdAt 순으로 뒤에 붙인다.
 */
export function mergeRoutines(
  local: StoredRoutine[],
  remote: StoredRoutine[],
  owner: string,
): StoredRoutine[] {
  const remoteById = new Map(remote.map((routine) => [routine.id, routine]))
  const seen = new Set<string>()

  const merged = local.map((mine) => {
    if (mine.owner !== owner) return mine
    seen.add(mine.id)

    const theirs = remoteById.get(mine.id)
    if (!theirs) {
      if (mine.deletedAt !== null && !mine.dirty) return null
      return { ...mine, dirty: true }
    }

    if (mine.updatedAt > theirs.updatedAt) return { ...mine, dirty: true }
    return { ...theirs, owner, dirty: false, syncError: null }
  })

  const remoteOnly = remote
    .filter((routine) => !seen.has(routine.id))
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((routine) => ({ ...routine, owner, dirty: false, syncError: null }))

  const kept = merged.filter((routine): routine is StoredRoutine => routine !== null)
  return [...kept, ...remoteOnly]
}

/**
 * 로그인 전에 만든 손님 루틴을 이 계정으로 가져온다. 올려야 하므로 dirty 이고,
 * updatedAt 을 지금으로 해 서버의 옛 사본과 겨룰 때 가져온 쪽이 이기게 한다.
 * 손님 묘비는 올릴 곳이 없던 것이라 버린다.
 */
export function adoptGuestRoutines(local: StoredRoutine[], owner: string): StoredRoutine[] {
  const now = Date.now()
  return local
    .filter((routine) => routine.owner !== null || routine.deletedAt === null)
    .map((routine) =>
      routine.owner === null ? { ...routine, owner, dirty: true, updatedAt: now } : routine,
    )
}

/**
 * 로그아웃할 때 그 계정의 서버에 이미 반영된 것(묘비 포함)을 지운다. 이 브라우저에
 * 계정 루틴이 남으면 다음 사람이 쓰는 기기에 개인 데이터가 남는다. 아직 못 올린
 * dirty 는 지우면 영영 잃으므로 남긴다.
 */
export function cleanupAfterSignOut(local: StoredRoutine[], owner: string): StoredRoutine[] {
  return local.filter((routine) => routine.owner !== owner || routine.dirty)
}

/**
 * `owner` 의 로컬 기록과 서버 기록을 id 로 합친다. 기록은 추가만 되므로 같은 id 는 같은
 * 내용이다 — 겨룰 것이 없고 서버 사본을 쓰면 된다.
 *
 * - 서버에 없는 로컬 기록은 dirty 로 남겨 다음 동기화가 올리게 한다.
 * - 다른 주인(손님 포함)의 로컬 기록은 이 계정의 일이 아니므로 그대로 둔다.
 * - 순서는 로컬을 유지하고, 서버에만 있는 것은 completedAt 순으로 뒤에 붙인다.
 */
export function mergeWorkouts(
  local: WorkoutLog[],
  remote: WorkoutLog[],
  owner: string,
): WorkoutLog[] {
  const remoteById = new Map(remote.map((log) => [log.id, log]))
  const seen = new Set<string>()

  const merged = local.map((mine) => {
    if (mine.owner !== owner) return mine
    seen.add(mine.id)
    const theirs = remoteById.get(mine.id)
    return theirs ? { ...theirs, owner, dirty: false } : { ...mine, dirty: true }
  })

  const remoteOnly = remote
    .filter((log) => !seen.has(log.id))
    .sort((a, b) => a.completedAt - b.completedAt)
    .map((log) => ({ ...log, owner, dirty: false }))

  return [...merged, ...remoteOnly]
}

/** 로그인 전에 남긴 손님 기록을 이 계정으로 가져온다. 올려야 하므로 dirty 다. */
export function adoptGuestWorkouts(local: WorkoutLog[], owner: string): WorkoutLog[] {
  return local.map((log) => (log.owner === null ? { ...log, owner, dirty: true } : log))
}

/**
 * 로그아웃할 때 그 계정의 서버에 이미 반영된 기록을 지운다 — 다음 사람이 쓰는 기기에 개인
 * 기록이 남지 않게. 아직 못 올린 dirty 는 지우면 영영 잃으므로 남긴다.
 */
export function cleanupWorkoutsAfterSignOut(local: WorkoutLog[], owner: string): WorkoutLog[] {
  return local.filter((log) => log.owner !== owner || log.dirty)
}

export type SessionChange =
  | { kind: 'none' }
  | { kind: 'signed-in'; userId: string }
  | { kind: 'signed-out'; previous: string }
  | { kind: 'switched'; previous: string; userId: string }

/** 이전에 알던 사용자와 지금 사용자를 비교해 무엇이 일어났는지 가른다. */
export function classifySessionChange(
  lastUserId: string | null,
  currentUserId: string | null,
): SessionChange {
  if (lastUserId === currentUserId) return { kind: 'none' }
  if (lastUserId === null) return { kind: 'signed-in', userId: currentUserId! }
  if (currentUserId === null) return { kind: 'signed-out', previous: lastUserId }
  return { kind: 'switched', previous: lastUserId, userId: currentUserId }
}
