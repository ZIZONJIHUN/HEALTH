import { WORKOUT_LIMITS, type WorkoutLog } from '@/features/workouts/workouts'
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
 * - 서버에 없는 로컬 루틴의 지난 거절(syncError)은 지운다. 상한(200개) 거절은 다른 기기에서
 *   지웠거나 묘비가 정리되면 풀리는데, 거절을 남겨 두면 그 루틴을 다시 고치기 전에는 영영 올리지
 *   않는다. 아직도 거절될 내용이면 당길 때마다 한 번씩만 다시 거절된다.
 * - 다른 주인(손님 포함)의 로컬 루틴은 이 계정의 일이 아니므로 그대로 둔다.
 * - 순서는 로컬을 유지하고, 서버에만 있는 것은 서버 순서(position, 같으면 createdAt)로 뒤에 붙인다.
 * - 서버 행이 있으면 그 position 을 syncedPosition 으로 기억한다 — 로컬 자리와 다르면 다음
 *   밀기가 자리를 바로잡는다.
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
      return { ...mine, dirty: true, syncError: null }
    }

    if (mine.updatedAt > theirs.updatedAt) {
      return { ...mine, dirty: true, syncedPosition: theirs.syncedPosition }
    }
    return { ...theirs, owner, dirty: false, syncError: null }
  })

  const remoteOnly = remote
    .filter((routine) => !seen.has(routine.id))
    .sort(
      (a, b) =>
        (a.syncedPosition ?? Number.MAX_SAFE_INTEGER) -
          (b.syncedPosition ?? Number.MAX_SAFE_INTEGER) || a.createdAt - b.createdAt,
    )
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

/**
 * 로그인 전에 남긴 손님 기록을 이 계정으로 가져온다. 올려야 하므로 dirty 다.
 *
 * 이 계정의 같은 날 기록과 합쳐 하루 상한(20건)을 넘는 손님 기록은 가져오지 않고 버리며, 몇 건인지
 * 돌려준다. 그대로 올리면 서버가 거절하고 그 기록은 지워진다 — 미리 세어 사용자에게 알리는 편이
 * 낫다. 손님 기록으로 남기면 가져오기 시트가 같은 것을 끝없이 다시 묻는다.
 * (서버에만 있고 아직 당겨 오지 않은 기록은 셀 수 없다. 그 차이는 밀기의 거절 알림이 맡는다.)
 */
export function adoptGuestWorkouts(
  local: WorkoutLog[],
  owner: string,
): { workouts: WorkoutLog[]; dropped: number } {
  const perDay = new Map<string, number>()
  for (const log of local) {
    if (log.owner === owner) perDay.set(log.localDate, (perDay.get(log.localDate) ?? 0) + 1)
  }
  let dropped = 0
  const workouts: WorkoutLog[] = []
  for (const log of local) {
    if (log.owner !== null) {
      workouts.push(log)
      continue
    }
    const count = perDay.get(log.localDate) ?? 0
    if (count >= WORKOUT_LIMITS.perDay) {
      dropped += 1
      continue
    }
    perDay.set(log.localDate, count + 1)
    workouts.push({ ...log, owner, dirty: true })
  }
  return { workouts, dropped }
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
