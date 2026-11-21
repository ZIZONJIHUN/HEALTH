import {
  loadStoredWorkouts,
  replaceStoredWorkouts,
  subscribeWorkouts,
  type WorkoutLog,
} from '@/features/workouts/workouts'
import {
  classifySessionChange,
  cleanupAfterSignOut,
  cleanupWorkoutsAfterSignOut,
  mergeRoutines,
  mergeWorkouts,
} from './merge'
import type { PushResult } from './routineSync'
import {
  loadStoredRoutines,
  readLastUser,
  replaceStoredRoutines,
  setActiveOwner,
  subscribeRoutines,
  writeLastUser,
  type StoredRoutine,
} from './routines'
import {
  applyRoutinePush,
  applyWorkoutPush,
  hasPendingPush,
  retryDelay,
  routinesToPush,
  shouldPullOnFocus,
  workoutsToPush,
} from './syncPlan'
import { registerSignOutFlush, registerSyncRunner, reportDroppedWorkouts } from './syncStatus'

/**
 * 동기화 엔진 — 인증 변화·저장소 변경·포커스·타이머를 받아 당기기와 밀기를 돌린다.
 *
 * 판단은 syncPlan.ts·merge.ts 의 순수 함수가 하고 여기는 순서와 동시성만 책임진다:
 * 한 번에 한 바퀴, 같은 주인에게 요청 하나씩, 사용자가 바뀌면 받던 결과를 버린다.
 * Supabase 를 직접 모르고 SyncAuth·SyncIo 로 받는다 — 테스트가 네트워크 없이 이 순서를
 * 검증할 수 있게(SyncController 가 실제 클라이언트로 묶어 넘긴다).
 */

export type SyncAuth = {
  /** 로그인 사용자 id 가 알려질 때마다 부른다(첫 세션 포함). 구독을 끊는 함수를 돌려준다. */
  onUserChange(listener: (userId: string | null) => void): () => void
  /** 서버에 확인한 사용자. 오프라인처럼 확인하지 못했으면 'unknown' — 로그아웃으로 읽지 않는다. */
  getUser(): Promise<string | null | 'unknown'>
}

export type SyncIo = {
  fetchRoutines(userId: string): Promise<StoredRoutine[]>
  fetchWorkouts(userId: string): Promise<WorkoutLog[]>
  pushRoutine(userId: string, routine: StoredRoutine, position: number): Promise<PushResult>
  pushWorkout(userId: string, log: WorkoutLog): Promise<PushResult>
}

/** 로그아웃 때 못 올린 것을 마저 밀어 보는 최대 시간. 사용자를 그 이상 기다리게 하지 않는다. */
export const SIGN_OUT_FLUSH_MS = 3_000
/** 연달아 고칠 때(이름 입력, 순서 바꾸기) 요청을 한 번으로 모은다. */
export const CHANGE_DEBOUNCE_MS = 500

type Stop = () => boolean

/** 작업을 SIGN_OUT_FLUSH_MS 까지만 기다린다. 작업의 실패는 삼킨다 — 기다림이 목적이다. */
function withinFlushLimit(work: Promise<unknown>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  return Promise.race([
    work.then(
      () => undefined,
      () => undefined,
    ),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, SIGN_OUT_FLUSH_MS)
    }),
  ]).finally(() => clearTimeout(timer))
}

/** 한 바퀴 안에서 같은 판을 두 번 보내지 않으려고 쓰는 열쇠. */
function versionKey(routine: StoredRoutine, position: number): string {
  return `${routine.id}|${routine.updatedAt}|${routine.deletedAt}|${position}`
}

export function startSync(auth: SyncAuth, io: SyncIo): () => void {
  let disposed = false
  /** undefined: 아직 모름. 알기 전에는 아무것도 하지 않는다 — 모름을 로그아웃으로 읽으면 치워 버린다. */
  let currentUser: string | null | undefined = undefined
  let running = false
  let again = false
  let needPull = true
  let lastPullAt: number | null = null
  let attempt = 0
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let debounceTimer: ReturnType<typeof setTimeout> | undefined
  /** 내가 쓴 저장은 변경 구독이 무시한다. 아니면 밀기 결과를 쓸 때마다 백오프를 건너뛰고 다시 민다. */
  let selfWrite = false

  function quietly(fn: () => void): void {
    selfWrite = true
    try {
      fn()
    } finally {
      selfWrite = false
    }
  }

  /**
   * owner 의 dirty 를 하나씩 민다(같은 주인에게 동시에 두 요청을 보내지 않는다).
   * 일시 실패가 나면 거기서 멈춘다 — 오프라인이면 나머지도 같은 결과다. 다 됐으면 true.
   *
   * 올릴 목록은 한 건마다 다시 계산한다. 묘비가 올라가면 상한에 걸렸던 루틴의 거절이 풀리고
   * (applyRoutinePush), 그 루틴은 이번 바퀴에 바로 올라가야 한다. 같은 판(版)은 한 바퀴에 한 번만
   * 보낸다 — 결과가 반영되지 않는 경우에도 같은 요청을 되풀이하지 않게.
   */
  async function push(owner: string, stop: Stop): Promise<boolean> {
    const sent = new Set<string>()
    for (;;) {
      const next = routinesToPush(loadStoredRoutines(), owner).find(
        (entry) => !sent.has(versionKey(entry.routine, entry.position)),
      )
      if (!next) break
      const { routine, position } = next
      sent.add(versionKey(routine, position))
      if (stop()) return false
      const result = await io.pushRoutine(owner, routine, position)
      if (stop()) return false
      const stored = loadStoredRoutines()
      const applied = applyRoutinePush(stored, routine, result, position)
      if (applied !== stored) quietly(() => replaceStoredRoutines(applied))
      if (!result.ok && result.kind === 'transient') return false
    }
    for (const log of workoutsToPush(loadStoredWorkouts(), owner)) {
      if (stop()) return false
      const result = await io.pushWorkout(owner, log)
      if (stop()) return false
      const stored = loadStoredWorkouts()
      const next = applyWorkoutPush(stored, log, result)
      if (next !== stored) quietly(() => replaceStoredWorkouts(next))
      if (!result.ok && result.kind === 'transient') return false
      // 거절된 기록은 저장소에서 지워진다. 흔적이 없으니 알림으로 남긴다 — 조용한 실패 금지.
      if (!result.ok) reportDroppedWorkouts(1, result.reason)
    }
    return true
  }

  /**
   * 서버의 두 표를 읽어 합친다. 읽기 실패는 일시 실패로 친다(fetch 함수들은 던진다).
   * 받는 동안 사용자가 바뀌었으면 버린다 — 이전 사용자의 루틴을 지금 저장소에 섞지 않게.
   */
  async function pull(owner: string): Promise<boolean> {
    let remote: [StoredRoutine[], WorkoutLog[]]
    try {
      remote = await Promise.all([io.fetchRoutines(owner), io.fetchWorkouts(owner)])
    } catch {
      return false
    }
    if (disposed || currentUser !== owner) return false
    quietly(() => {
      replaceStoredRoutines(mergeRoutines(loadStoredRoutines(), remote[0], owner))
      replaceStoredWorkouts(mergeWorkouts(loadStoredWorkouts(), remote[1], owner))
    })
    needPull = false
    lastPullAt = Date.now()
    return true
  }

  function scheduleRetry(ok: boolean): void {
    clearTimeout(retryTimer)
    retryTimer = undefined
    if (ok || disposed || !currentUser) {
      attempt = 0
      return
    }
    retryTimer = setTimeout(kick, retryDelay(attempt))
    attempt += 1
  }

  async function cycle(): Promise<void> {
    const current = currentUser
    if (current === undefined) return

    // 마지막으로 본 사용자와 비교한다. 앱이 꺼져 있는 동안 끝난 세션도 여기서 잡힌다.
    const change = classifySessionChange(readLastUser(), current)

    // 화면의 주인은 무엇보다 먼저 지금 사용자로 바꾼다. 이전 사용자를 주인으로 둔 채 밀기를
    // 기다리면 그 몇 초 동안 새 사용자(또는 손님)에게 이전 사용자의 루틴이 보이고, 그때 만든
    // 루틴이 이전 사용자 소유로 찍혀 다음에 그 계정으로 올라간다. 가져오기 시트도 지금 주인을
    // 보므로 손님 루틴을 이전 사용자 계정에 넣을 수 있게 된다. 밀기와 정리는 주인을 인자로 받는다.
    quietly(() => setActiveOwner(current))

    if (change.kind === 'signed-out' || change.kind === 'switched') {
      const previous = change.previous
      // 이 시점의 클라이언트는 이미 이전 사용자의 세션을 잃었으므로 대개 실패한다(RLS → 일시 실패).
      // 실제로 밀 수 있는 마지막 기회는 로그아웃 버튼의 flushBeforeSignOut 이다. 여기서는
      // 세션 만료 직전에 갱신된 경우처럼 성공할 수도 있는 경우를 위해 짧게 한 번만 시도한다.
      let flushDone = false
      await withinFlushLimit(push(previous, () => disposed || flushDone))
      // 시간이 다 되면 남은 밀기를 멈춘다. 치운 뒤에 결과를 쓰면 지운 루틴이 되살아난다.
      flushDone = true
      if (disposed) return
      // 반영된 것만 지우고 못 올린 것은 남긴다 — 이전 사용자가 다시 로그인하면 마저 민다.
      quietly(() => {
        replaceStoredRoutines(cleanupAfterSignOut(loadStoredRoutines(), previous))
        replaceStoredWorkouts(cleanupWorkoutsAfterSignOut(loadStoredWorkouts(), previous))
      })
    }
    if (change.kind !== 'none') needPull = true

    writeLastUser(current)
    if (current === null) {
      scheduleRetry(true)
      return
    }

    let ok = true
    if (needPull) ok = await pull(current)
    if (ok) ok = await push(current, () => disposed || currentUser !== current)
    scheduleRetry(ok)
  }

  /**
   * 한 번에 한 바퀴만 돈다. 도는 중에 들어온 요청은 끝난 뒤 한 바퀴 더로 모은다.
   * 돌려준 promise 는 그 "한 바퀴 더" 까지 끝나야 풀린다 — 로그아웃 전 밀기가 기다릴 수 있게.
   */
  let runDone: Promise<void> = Promise.resolve()

  function kick(): Promise<void> {
    if (disposed) return Promise.resolve()
    if (running) {
      again = true
      return runDone
    }
    runDone = run()
    return runDone
  }

  async function run(): Promise<void> {
    running = true
    try {
      do {
        again = false
        try {
          await cycle()
        } catch (error) {
          // 예상하지 못한 실패(손상된 값 등). 삼키지 않고 남기고, 다음에 다시 해 본다.
          console.error('[sync] 동기화 중 오류', error)
          scheduleRetry(false)
        }
      } while (again && !disposed)
    } finally {
      running = false
    }
  }

  function setUser(userId: string | null): void {
    if (disposed || userId === currentUser) return
    currentUser = userId
    // 화면 주인은 바퀴를 기다리지 않고 지금 바꾼다. 도는 바퀴가 느린 요청(타임아웃 없음)에 묶여
    // 있으면 cycle() 이 주인을 바꿀 때까지 이전 사용자의 루틴이 보이고, 그때 만든 루틴이 이전
    // 사용자 소유로 찍힌다. 저장소만 건드리므로 인증 콜백 안에서 불러도 안전하다.
    quietly(() => setActiveOwner(userId))
    // 인증 콜백 안에서 곧바로 Supabase 를 부르면 auth 잠금과 엉켜 멈출 수 있다. 한 틱 미룬다.
    setTimeout(kick, 0)
  }

  const offAuth = auth.onUserChange(setUser)
  auth.getUser().then(
    (user) => {
      if (user !== 'unknown') setUser(user)
    },
    () => {
      // 확인 자체가 실패했다 — 모름. 저장된 세션(onUserChange)을 믿는다.
    },
  )

  function onStoreChange(): void {
    if (selfWrite || !currentUser) return
    if (!hasPendingPush(loadStoredRoutines(), loadStoredWorkouts(), currentUser)) return
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(kick, CHANGE_DEBOUNCE_MS)
  }
  const offRoutines = subscribeRoutines(onStoreChange)
  const offWorkouts = subscribeWorkouts(onStoreChange)

  function onVisibility(): void {
    if (document.visibilityState !== 'visible' || !currentUser) return
    if (!shouldPullOnFocus(lastPullAt, Date.now())) return
    needPull = true
    void kick()
  }
  document.addEventListener('visibilitychange', onVisibility)

  function now(): Promise<void> {
    // 사용자가 직접 눌렀다(또는 손님 것을 가져왔다, 로그아웃하려 한다) — 백오프를 버리고 지금 한다.
    clearTimeout(retryTimer)
    attempt = 0
    return kick()
  }

  const offRunner = registerSyncRunner(() => {
    void now()
  })

  /**
   * 로그아웃 버튼이 auth.signOut() 전에 기다린다. 세션이 살아 있을 때 밀어야 실제로 올라간다.
   * 같은 바퀴 돌리기(kick)를 거치므로 진행 중인 밀기와 겹쳐 같은 주인에게 두 요청이 나가지 않는다.
   * 사용자를 3초 넘게 붙잡지 않고, 실패해도 로그아웃은 막지 않는다(던지지 않는다).
   */
  const offFlush = registerSignOutFlush(async () => {
    if (!currentUser) return
    await withinFlushLimit(now())
  })

  return () => {
    disposed = true
    clearTimeout(retryTimer)
    clearTimeout(debounceTimer)
    offAuth()
    offRoutines()
    offWorkouts()
    document.removeEventListener('visibilitychange', onVisibility)
    offRunner()
    offFlush()
  }
}
