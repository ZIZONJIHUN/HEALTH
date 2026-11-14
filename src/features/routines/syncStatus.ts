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

  const mine = routines.filter((routine) => routine.owner === owner)
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
 * 컨트롤러가 기억하는 것 두 가지.
 * - last-user: 마지막으로 본 로그인 사용자. 앱이 꺼져 있는 동안 세션이 끝났어도 다음 실행 때
 *   "누가 나갔는지" 알아야 그 사람의 루틴을 이 브라우저에서 치울 수 있다.
 * - kept-guest:<id>: 이 사용자가 손님 루틴을 "두기" 로 골랐다. 같은 기기에서 다시 묻지 않는다.
 * 저장소 접근이 던지는 환경(사파리 시크릿 등)에서는 기억하지 못할 뿐 앱은 계속 돈다.
 */
const LAST_USER_KEY = 'health-shorts:sync:last-user'
const KEPT_GUEST_PREFIX = 'health-shorts:sync:kept-guest:'

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, value)
  } catch {
    // 위 설명대로 — 기억하지 못하면 다음 실행에서 한 번 더 묻거나 치울 뿐이다.
  }
}

export function readLastUser(): string | null {
  return read(LAST_USER_KEY)
}

export function writeLastUser(userId: string | null): void {
  write(LAST_USER_KEY, userId)
}

export function isGuestKept(userId: string): boolean {
  return read(KEPT_GUEST_PREFIX + userId) !== null
}

export function markGuestKept(userId: string): void {
  write(KEPT_GUEST_PREFIX + userId, '1')
}
