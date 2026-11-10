import type { StoredRoutine } from './routines'

/**
 * 루틴 병합과 세션 전환 판단. 전부 순수 함수다 — 저장소·네트워크를 모르기 때문에
 * 동기화 컨트롤러가 부르기 전에 규칙만 따로 검증할 수 있고, 입력은 바꾸지 않는다.
 */

/** 두 루틴이 서버에 올릴 내용에서 같은가. 동기화 표시(owner·dirty·syncError)는 보지 않는다. */
function sameContent(a: StoredRoutine, b: StoredRoutine): boolean {
  return (
    a.name === b.name &&
    a.updatedAt === b.updatedAt &&
    a.deletedAt === b.deletedAt &&
    JSON.stringify(a.items) === JSON.stringify(b.items)
  )
}

/**
 * `owner` 의 로컬 루틴과 서버 루틴을 id 로 합친다.
 *
 * - 같은 id 는 updatedAt 이 큰 쪽이 이긴다. 같으면 서버가 이긴다 — 서버가 기준이어야
 *   같은 내용을 서로 다시 올리는 왕복이 생기지 않는다.
 * - 로컬이 이겼는데 서버와 내용이 다르면 dirty 로 남겨 다음 동기화가 올리게 한다.
 *   서버에 없는 로컬 루틴도 같다. 지운 쪽이 이기면 묘비가 이기는 것이라 별도 규칙이 없다.
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
    if (!theirs) return { ...mine, dirty: true }

    if (mine.updatedAt > theirs.updatedAt) {
      return { ...mine, dirty: !sameContent(mine, theirs) }
    }
    return { ...theirs, owner, dirty: false, syncError: null }
  })

  const remoteOnly = remote
    .filter((routine) => !seen.has(routine.id))
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((routine) => ({ ...routine, owner, dirty: false, syncError: null }))

  return [...merged, ...remoteOnly]
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
