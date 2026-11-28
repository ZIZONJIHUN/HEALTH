import { useSyncExternalStore } from 'react'
import {
  loadStoredWorkouts,
  subscribeWorkouts,
  type WorkoutLog,
} from '@/features/workouts/workouts'
import {
  getActiveOwner,
  loadStoredRoutines,
  subscribeRoutines,
  type StoredRoutine,
} from './routines'

/**
 * 동기화 상태와 컨트롤러가 기억하는 것.
 *
 * 상태를 따로 들지 않고 저장소의 표시(owner·dirty·syncError)에서 유도한다. 따로 들면 저장소와
 * 어긋나는 순간이 생기고, 그 틈에 "저장됨" 이 보이다 사라지는 일이 난다 — 설계 4.5 의
 * "조용한 실패 금지" 가 지키려는 바로 그것이다.
 */

export type SyncStatus =
  | { state: 'local' }
  | { state: 'synced' }
  | { state: 'pending' }
  | { state: 'rejected'; names: string[]; reason: string }

// useSyncExternalStore 는 참조로 변경을 판단한다. 내용이 같은 상태는 같은 객체를 돌려준다.
const LOCAL: SyncStatus = { state: 'local' }
const SYNCED: SyncStatus = { state: 'synced' }
const PENDING: SyncStatus = { state: 'pending' }

/**
 * owner 없음 → local. 내 것 중 거절된 것이 있으면 rejected(사용자가 고쳐야 풀리므로 무엇보다
 * 먼저 보여야 한다), 아직 못 올린 것이 있으면 pending, 아니면 synced.
 * 다른 주인·손님의 표시는 보지 않는다 — 이전 사용자가 못 올린 변경이 지금 사용자의 상태를
 * "저장 안 됨" 으로 만들면 지금 사용자는 고칠 방법이 없다.
 */
export function syncStatusFrom(
  routines: StoredRoutine[],
  workouts: WorkoutLog[],
  owner: string | null,
): SyncStatus {
  if (owner === null) return LOCAL

  // 거절된 묘비는 화면에 없는 루틴이라 사용자가 고칠 수 없다. 밀기 결과가 버리지만(applyRoutinePush),
  // 그 전에 남은 값이 있어도 상태 줄이 보이지 않는 루틴 이름을 부르거나 pending 에 묶이지 않게 뺀다.
  const mine = routines.filter(
    (routine) =>
      routine.owner === owner && !(routine.deletedAt !== null && routine.syncError !== null),
  )
  const rejected = mine.filter((routine) => routine.syncError !== null)
  if (rejected.length > 0) {
    return {
      state: 'rejected',
      names: rejected.map((routine) => routine.name),
      reason: rejected[0].syncError!,
    }
  }

  if (mine.some((routine) => routine.dirty)) return PENDING
  if (workouts.some((log) => log.owner === owner && log.dirty)) return PENDING
  return SYNCED
}

/**
 * 로그아웃하면 이 브라우저에만 남는 변경이 있는가(설계 4.4). 로그아웃 직전 밀기 뒤에도 못 올린
 * 것(dirty)이나 서버가 거절한 것이 있으면 true — 로그아웃 버튼이 확인을 띄운다.
 */
export function needsSignOutConfirm(
  routines: StoredRoutine[],
  workouts: WorkoutLog[],
  owner: string | null,
): boolean {
  const status = syncStatusFrom(routines, workouts, owner)
  return status.state === 'pending' || status.state === 'rejected'
}

/** needsSignOutConfirm 을 지금 저장소와 지금 주인으로 판단한다. */
export function hasUnsavedChanges(): boolean {
  return needsSignOutConfirm(loadStoredRoutines(), loadStoredWorkouts(), getActiveOwner())
}

function subscribe(listener: () => void): () => void {
  const offRoutines = subscribeRoutines(listener)
  // 기록 구독은 주인 변경도 함께 알린다.
  const offWorkouts = subscribeWorkouts(listener)
  return () => {
    offRoutines()
    offWorkouts()
  }
}

/** rejected 는 매번 새 객체라 입력 참조로 캐시한다. 저장소가 원문 단위로 참조를 고정해 둔다. */
let cached: {
  routines: StoredRoutine[]
  workouts: WorkoutLog[]
  owner: string | null
  status: SyncStatus
} | null = null

function snapshot(): SyncStatus {
  const routines = loadStoredRoutines()
  const workouts = loadStoredWorkouts()
  const owner = getActiveOwner()
  if (
    cached &&
    cached.routines === routines &&
    cached.workouts === workouts &&
    cached.owner === owner
  ) {
    return cached.status
  }
  cached = { routines, workouts, owner, status: syncStatusFrom(routines, workouts, owner) }
  return cached.status
}

/** 서버 HTML 에는 로그인 정보가 없다. local 로 그려야 하이드레이션 결과와 같다. */
function serverSnapshot(): SyncStatus {
  return LOCAL
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot)
}

/**
 * 동기화를 지금 다시 돌린다. 상태 줄의 "다시 시도" 가 부른다. 컨트롤러가 붙어 있지 않으면
 * (Supabase 설정 없음) 할 일이 없으므로 아무것도 하지 않는다.
 */
let syncRunner: (() => void) | null = null

export function retrySync(): void {
  syncRunner?.()
}

/** 컨트롤러만 쓴다. 돌려준 함수로 떼어 낸다. */
export function registerSyncRunner(runner: () => void): () => void {
  syncRunner = runner
  return () => {
    if (syncRunner === runner) syncRunner = null
  }
}

/**
 * 로그아웃 직전에 지금 사용자의 못 올린 변경을 밀어 본다. 최대 3초, 절대 던지지 않는다.
 * auth.signOut() 뒤에는 세션이 없어 밀 수 없으므로 로그아웃 버튼이 그 전에 기다린다.
 * 동기화가 돌고 있지 않으면(설정 없음, 비로그인) 바로 끝난다.
 */
let signOutFlush: (() => Promise<void>) | null = null

export async function flushBeforeSignOut(): Promise<void> {
  try {
    await signOutFlush?.()
  } catch {
    // 밀기 실패가 로그아웃을 막으면 안 된다. 못 올린 것은 dirty 로 남아 정리에서 지켜진다.
  }
}

/** 컨트롤러만 쓴다. 돌려준 함수로 떼어 낸다. */
export function registerSignOutFlush(flush: () => Promise<void>): () => void {
  signOutFlush = flush
  return () => {
    if (signOutFlush === flush) signOutFlush = null
  }
}

/**
 * 서버가 거절해 지운 운동 기록 알림. 기록은 거절되면 저장소에서 지우므로(applyWorkoutPush)
 * 저장소에서 유도할 흔적이 없다 — 따로 들지 않으면 기록이 조용히 사라진다(설계 4.5).
 * 손님 기록을 가져올 때 하루 상한으로 뺀 것도 여기로 알린다. 새로고침하면 사라지는 메모리
 * 값이다: 알리는 것이 목적이고, 사용자가 확인하면 닫는다.
 */
export type DroppedWorkouts = { count: number; reason: string } | null

let dropped: DroppedWorkouts = null
const droppedListeners = new Set<() => void>()

function notifyDropped(): void {
  for (const listener of droppedListeners) listener()
}

export function reportDroppedWorkouts(count: number, reason: string): void {
  if (count <= 0) return
  dropped = { count: (dropped?.count ?? 0) + count, reason }
  notifyDropped()
}

export function dismissDroppedWorkouts(): void {
  if (dropped === null) return
  dropped = null
  notifyDropped()
}

export function getDroppedWorkouts(): DroppedWorkouts {
  return dropped
}

function subscribeDropped(listener: () => void): () => void {
  droppedListeners.add(listener)
  return () => {
    droppedListeners.delete(listener)
  }
}

export function useDroppedWorkouts(): DroppedWorkouts {
  return useSyncExternalStore(subscribeDropped, getDroppedWorkouts, () => null)
}
