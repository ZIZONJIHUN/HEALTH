import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StoredRoutine } from '@/features/routines/routines'
import type { PushResult } from '@/features/routines/routineSync'
import type { SyncAuth, SyncIo } from '@/features/routines/syncEngine'
import type { WorkoutLog } from '@/features/workouts/workouts'

/**
 * 동기화 엔진의 순서·동시성. 네트워크 대신 가짜 SyncAuth·SyncIo 를, 브라우저 대신
 * 저장소가 실제로 쓰는 것만 흉내 낸 스텁을 쓴다(routines.test.ts 와 같은 방식).
 */

const ROUTINES_KEY = 'health-shorts:routines:v2'
const WORKOUTS_KEY = 'health-shorts:workouts:v1'
const LAST_USER_KEY = 'health-shorts:sync:last-user'

let store: Map<string, string>
/** 저장된 적 있는 모든 값. 잠깐이라도 남의 루틴이 쓰였는지 보려고 남긴다. */
let writes: string[]

function installBrowserStub() {
  store = new Map<string, string>()
  writes = []
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        writes.push(value)
        store.set(key, value)
      },
      removeItem: (key: string) => void store.delete(key),
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  })
  vi.stubGlobal('document', {
    visibilityState: 'visible',
    addEventListener: () => {},
    removeEventListener: () => {},
  })
}

function routine(id: string, over: Partial<StoredRoutine> = {}): StoredRoutine {
  return {
    id,
    name: `루틴 ${id}`,
    createdAt: 1,
    items: [],
    updatedAt: 10,
    deletedAt: null,
    owner: 'u1',
    dirty: false,
    syncError: null,
    syncedPosition: null,
    ...over,
  }
}

function log(id: string, over: Partial<WorkoutLog> = {}): WorkoutLog {
  return {
    id,
    routineId: 'r1',
    routineName: '하체',
    completedAt: 1,
    localDate: '2026-11-10',
    owner: 'u1',
    dirty: false,
    ...over,
  }
}

function seed(routines: StoredRoutine[], workouts: WorkoutLog[] = [], lastUser?: string) {
  store.set(ROUTINES_KEY, JSON.stringify(routines))
  store.set(WORKOUTS_KEY, JSON.stringify(workouts))
  if (lastUser) store.set(LAST_USER_KEY, lastUser)
}

function storedRoutines(): StoredRoutine[] {
  return JSON.parse(store.get(ROUTINES_KEY) ?? '[]')
}

function storedWorkouts(): WorkoutLog[] {
  return JSON.parse(store.get(WORKOUTS_KEY) ?? '[]')
}

/** 서버 흉내. 사용자별 표와 다음 응답을 정할 수 있다. 동시에 몇 개가 날아가는지 센다. */
function fakeServer() {
  const routines = new Map<string, StoredRoutine[]>()
  const workouts = new Map<string, WorkoutLog[]>()
  const pushes: string[] = []
  let inFlight = 0
  let maxInFlight = 0
  let nextResults: PushResult[] = []
  let fetchFails = false
  let hold: Promise<void> | null = null

  async function respond(label: string): Promise<PushResult> {
    pushes.push(label)
    inFlight += 1
    maxInFlight = Math.max(maxInFlight, inFlight)
    if (hold) await hold
    await Promise.resolve()
    inFlight -= 1
    return nextResults.shift() ?? { ok: true }
  }

  const io: SyncIo = {
    async fetchRoutines(userId) {
      if (hold) await hold
      if (fetchFails) throw new Error('offline')
      return routines.get(userId) ?? []
    },
    async fetchWorkouts(userId) {
      if (fetchFails) throw new Error('offline')
      return workouts.get(userId) ?? []
    },
    pushRoutine: (userId, r) => respond(`${userId}:${r.id}`),
    pushWorkout: (userId, l) => respond(`${userId}:${l.id}`),
  }

  return {
    io,
    routines,
    workouts,
    pushes,
    get maxInFlight() {
      return maxInFlight
    },
    willRespond(...results: PushResult[]) {
      nextResults = results
    },
    setFetchFails(fails: boolean) {
      fetchFails = fails
    },
    holdUntil(promise: Promise<void> | null) {
      hold = promise
    },
  }
}

function fakeAuth(initial: string | null | 'unknown') {
  let listener: ((userId: string | null) => void) | null = null
  const auth: SyncAuth = {
    onUserChange(next) {
      listener = next
      return () => {
        listener = null
      }
    },
    getUser: async () => initial,
  }
  return {
    auth,
    emit(userId: string | null) {
      listener?.(userId)
    },
  }
}

async function freshEngine() {
  vi.resetModules()
  const engine = await import('@/features/routines/syncEngine')
  const routines = await import('@/features/routines/routines')
  const status = await import('@/features/routines/syncStatus')
  return { ...engine, ...routines, ...status }
}

/** 타이머와 그 사이의 promise 를 함께 흘려보낸다. */
async function flush(ms = 0) {
  await vi.advanceTimersByTimeAsync(ms)
}

let stop: (() => void) | null = null

beforeEach(() => {
  installBrowserStub()
  vi.useFakeTimers()
})

afterEach(() => {
  stop?.()
  stop = null
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('startSync', () => {
  it('로그인 상태로 열면 당겨 합치고, 내 dirty 를 민 뒤 last-user 를 남긴다', async () => {
    const { startSync, getActiveOwner } = await freshEngine()
    seed([routine('a', { dirty: true, updatedAt: 50 })], [log('w', { dirty: true })])
    const server = fakeServer()
    server.routines.set('u1', [routine('b', { createdAt: 5 })])
    stop = startSync(fakeAuth('u1').auth, server.io)
    await flush()

    expect(getActiveOwner()).toBe('u1')
    expect(store.get(LAST_USER_KEY)).toBe('u1')
    expect(server.pushes).toEqual(['u1:a', 'u1:w'])
    expect(storedRoutines().map((r) => [r.id, r.dirty])).toEqual([
      ['a', false],
      ['b', false],
    ])
    expect(storedWorkouts()[0].dirty).toBe(false)
  })

  it('사용자를 모르면(아직 확인 전) 아무것도 하지 않는다', async () => {
    const { startSync, getActiveOwner } = await freshEngine()
    seed([routine('a')], [], 'u1')
    const server = fakeServer()
    stop = startSync(fakeAuth('unknown').auth, server.io)
    await flush(10_000)
    expect(getActiveOwner()).toBeNull()
    expect(storedRoutines()).toHaveLength(1)
    expect(store.get(LAST_USER_KEY)).toBe('u1')
  })

  it('앱이 꺼진 동안 세션이 끝났으면 다음 실행에서 반영된 것만 치우고 못 올린 것은 남긴다', async () => {
    const { startSync, getActiveOwner } = await freshEngine()
    seed(
      [
        routine('synced'),
        routine('unsent', { dirty: true }),
        routine('guest', { owner: null }),
      ],
      [log('w1'), log('w2', { dirty: true })],
      'u1',
    )
    const server = fakeServer()
    // 세션이 없으니 밀기는 실패한다.
    server.willRespond({ ok: false, kind: 'transient' })
    stop = startSync(fakeAuth(null).auth, server.io)
    await flush()

    expect(server.pushes).toEqual(['u1:unsent'])
    expect(storedRoutines().map((r) => r.id)).toEqual(['unsent', 'guest'])
    expect(storedWorkouts().map((l) => l.id)).toEqual(['w2'])
    expect(getActiveOwner()).toBeNull()
    expect(store.has(LAST_USER_KEY)).toBe(false)
  })

  it('다른 사용자로 바뀌면 이전 사용자 것을 치우고, 새 사용자에게 섞지 않는다', async () => {
    const { startSync, getActiveOwner } = await freshEngine()
    seed([routine('a'), routine('b', { dirty: true })], [], 'u1')
    const server = fakeServer()
    server.willRespond({ ok: false, kind: 'transient' })
    server.routines.set('u2', [routine('c', { owner: 'u2' })])
    stop = startSync(fakeAuth('u2').auth, server.io)
    await flush()

    expect(getActiveOwner()).toBe('u2')
    const after = storedRoutines()
    expect(after.map((r) => [r.id, r.owner])).toEqual([
      ['b', 'u1'],
      ['c', 'u2'],
    ])
    // u2 로는 u1 의 루틴을 한 번도 올리지 않는다.
    expect(server.pushes.filter((p) => p.startsWith('u2:'))).toEqual([])
  })

  it('로그아웃 밀기는 3초에서 끊고, 늦게 온 결과는 쓰지 않는다', async () => {
    const { startSync } = await freshEngine()
    seed([routine('a', { dirty: true })], [], 'u1')
    const server = fakeServer()
    server.holdUntil(new Promise(() => {}))
    const { auth } = fakeAuth(null)
    stop = startSync(auth, server.io)
    await flush(2_999)
    expect(store.get(LAST_USER_KEY)).toBe('u1')
    await flush(1)
    expect(store.has(LAST_USER_KEY)).toBe(false)
    expect(storedRoutines().map((r) => [r.id, r.dirty])).toEqual([['a', true]])
  })

  it('일시 실패는 5초 뒤 다시 민다', async () => {
    const { startSync } = await freshEngine()
    seed([routine('a', { dirty: true })], [], 'u1')
    const server = fakeServer()
    server.willRespond({ ok: false, kind: 'transient' })
    stop = startSync(fakeAuth('u1').auth, server.io)
    await flush()
    expect(server.pushes).toEqual(['u1:a'])
    expect(storedRoutines()[0].dirty).toBe(true)

    await flush(4_999)
    expect(server.pushes).toHaveLength(1)
    await flush(1)
    expect(server.pushes).toEqual(['u1:a', 'u1:a'])
    expect(storedRoutines()[0].dirty).toBe(false)
  })

  it('당기기가 던지면 일시 실패로 보고 다시 시도한다', async () => {
    const { startSync } = await freshEngine()
    seed([routine('a', { dirty: true })], [], 'u1')
    const server = fakeServer()
    server.setFetchFails(true)
    stop = startSync(fakeAuth('u1').auth, server.io)
    await flush()
    expect(server.pushes).toEqual([])

    server.setFetchFails(false)
    await flush(5_000)
    expect(server.pushes).toEqual(['u1:a'])
  })

  it('거절된 루틴은 이유를 남기고 다시 밀지 않는다', async () => {
    const { startSync, retrySync } = await freshEngine()
    seed([routine('a', { dirty: true })], [], 'u1')
    const server = fakeServer()
    server.willRespond({ ok: false, kind: 'rejected', reason: '루틴 이름은 60자까지예요' })
    stop = startSync(fakeAuth('u1').auth, server.io)
    await flush()
    expect(storedRoutines()[0]).toMatchObject({ dirty: true, syncError: '루틴 이름은 60자까지예요' })

    retrySync()
    await flush(120_000)
    expect(server.pushes).toEqual(['u1:a'])
  })

  it('거절된 기록은 저장소에서 지운다', async () => {
    const { startSync } = await freshEngine()
    seed([], [log('w', { dirty: true }), log('x')], 'u1')
    const server = fakeServer()
    server.workouts.set('u1', [log('x')])
    server.willRespond({ ok: false, kind: 'rejected', reason: '하루 상한' })
    stop = startSync(fakeAuth('u1').auth, server.io)
    await flush()
    expect(storedWorkouts().map((l) => l.id)).toEqual(['x'])
  })

  it('당기는 동안 사용자가 바뀌면 받은 것을 버린다 — 잠깐이라도 쓰지 않는다', async () => {
    const { startSync } = await freshEngine()
    seed([], [])
    const server = fakeServer()
    server.routines.set('u1', [routine('mine-u1')])
    let release: () => void = () => {}
    server.holdUntil(new Promise<void>((resolve) => (release = resolve)))
    const { auth, emit } = fakeAuth('u1')
    stop = startSync(auth, server.io)
    await flush()

    emit('u2')
    server.holdUntil(null)
    release()
    await flush()
    // 바뀐 뒤 정리가 지워 주더라도, 그 사이 다른 탭이 읽거나 앱이 닫히면 남는다.
    expect(writes.some((value) => value.includes('mine-u1'))).toBe(false)
  })

  it('저장소 변경은 500ms 모아서 밀고, 요청은 한 번에 하나다', async () => {
    const { startSync, createRoutine, renameRoutine } = await freshEngine()
    seed([], [], 'u1')
    const server = fakeServer()
    stop = startSync(fakeAuth('u1').auth, server.io)
    await flush()

    const a = createRoutine('하체')!
    createRoutine('상체')
    renameRoutine(a.id, '하체 2')
    await flush(499)
    expect(server.pushes).toEqual([])
    await flush(1)
    expect(server.pushes).toHaveLength(2)
    expect(server.maxInFlight).toBe(1)
    expect(storedRoutines().every((r) => !r.dirty)).toBe(true)
  })

  it('로그아웃 밀기 동안 주인은 이미 새 사용자다 — 그사이 만든 루틴이 이전 계정으로 가지 않는다', async () => {
    const { startSync, getActiveOwner, createRoutine } = await freshEngine()
    const { guestPrompt } = await import('@/features/routines/syncPlan')
    const { loadStoredRoutines } = await import('@/features/routines/routines')
    const { loadStoredWorkouts } = await import('@/features/workouts/workouts')
    seed([routine('a', { dirty: true }), routine('g', { owner: null })], [], 'u1')
    const server = fakeServer()
    server.holdUntil(new Promise(() => {}))
    stop = startSync(fakeAuth('u2').auth, server.io)
    await flush(1_000)

    // 아직 밀기를 기다리는 중이다(last-user 는 그대로).
    expect(store.get(LAST_USER_KEY)).toBe('u1')
    expect(getActiveOwner()).toBe('u2')
    const created = createRoutine('새 루틴')!
    const owners = storedRoutines().filter((r) => r.id === created.id).map((r) => r.owner)
    expect(owners).toEqual(['u2'])
    // 가져오기 시트는 지금 주인으로 묻는다 — 이전 사용자 계정으로 가져갈 길이 없다.
    expect(getActiveOwner()).not.toBe('u1')
    expect(guestPrompt(loadStoredRoutines(), loadStoredWorkouts())).not.toBeNull()

    await flush(2_000)
    expect(storedRoutines().find((r) => r.id === created.id)?.owner).toBe('u2')
    expect(storedRoutines().some((r) => r.owner === 'u1' && r.id !== 'a')).toBe(false)
  })

  it('세션이 끝나 손님이 되면 밀기 동안 만든 루틴은 손님 것이다', async () => {
    const { startSync, getActiveOwner, createRoutine } = await freshEngine()
    seed([routine('a', { dirty: true })], [], 'u1')
    const server = fakeServer()
    server.holdUntil(new Promise(() => {}))
    stop = startSync(fakeAuth(null).auth, server.io)
    await flush(1_000)
    expect(getActiveOwner()).toBeNull()
    const created = createRoutine('손님 루틴')!
    await flush(2_000)
    expect(storedRoutines().find((r) => r.id === created.id)).toMatchObject({
      owner: null,
      dirty: false,
    })
  })
})

describe('flushBeforeSignOut', () => {
  it('동기화가 돌지 않으면 바로 끝난다', async () => {
    const { flushBeforeSignOut } = await freshEngine()
    await expect(flushBeforeSignOut()).resolves.toBeUndefined()
  })

  it('세션이 살아 있을 때 지금 사용자의 dirty 를 민 뒤 끝난다', async () => {
    const { startSync, flushBeforeSignOut, createRoutine } = await freshEngine()
    seed([], [], 'u1')
    const server = fakeServer()
    stop = startSync(fakeAuth('u1').auth, server.io)
    await flush()
    createRoutine('하체')

    let done = false
    void flushBeforeSignOut().then(() => (done = true))
    await flush()
    // 디바운스(500ms)를 기다리지 않고 바로 밀었다.
    expect(done).toBe(true)
    expect(server.pushes).toHaveLength(1)
    expect(storedRoutines()[0].dirty).toBe(false)
  })

  it('밀기가 끝나지 않아도 3초에서 끝난다', async () => {
    const { startSync, flushBeforeSignOut, createRoutine } = await freshEngine()
    seed([], [], 'u1')
    const server = fakeServer()
    stop = startSync(fakeAuth('u1').auth, server.io)
    await flush()
    server.holdUntil(new Promise(() => {}))
    createRoutine('하체')

    let done = false
    void flushBeforeSignOut().then(() => (done = true))
    await flush(2_999)
    expect(done).toBe(false)
    await flush(1)
    expect(done).toBe(true)
  })

  it('밀기가 던져도 거절하지 않는다', async () => {
    const { startSync, flushBeforeSignOut, createRoutine } = await freshEngine()
    seed([], [], 'u1')
    const server = fakeServer()
    stop = startSync(fakeAuth('u1').auth, server.io)
    await flush()
    server.io.pushRoutine = async () => {
      throw new Error('boom')
    }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    createRoutine('하체')
    const result = flushBeforeSignOut()
    await flush()
    await expect(result).resolves.toBeUndefined()
  })
})

describe('startSync — 점검에서 나온 경우', () => {
  it('당기기가 끝나지 않아도 로그아웃하면 화면 주인은 곧바로 바뀐다', async () => {
    const { startSync, getActiveOwner, createRoutine } = await freshEngine()
    seed([routine('a')], [], 'u1')
    const server = fakeServer()
    // 느린 연결 — 당기기가 끝나지 않는다.
    server.holdUntil(new Promise(() => {}))
    const { auth, emit } = fakeAuth('u1')
    stop = startSync(auth, server.io)
    await flush()
    expect(getActiveOwner()).toBe('u1')

    emit(null)
    expect(getActiveOwner()).toBeNull()
    const created = createRoutine('손님 루틴')!
    expect(storedRoutines().find((r) => r.id === created.id)?.owner).toBeNull()
  })

  it('상한으로 거절된 루틴은 다른 루틴을 지우면 다시 올라간다', async () => {
    const { startSync, deleteRoutine } = await freshEngine()
    seed([routine('y', { syncedPosition: 0 }), routine('x', { dirty: true })], [], 'u1')
    const server = fakeServer()
    server.routines.set('u1', [routine('y', { syncedPosition: 0 })])
    server.willRespond({ ok: false, kind: 'rejected', reason: '루틴은 200개까지 저장할 수 있어요' })
    stop = startSync(fakeAuth('u1').auth, server.io)
    await flush()
    expect(storedRoutines().find((r) => r.id === 'x')?.syncError).not.toBeNull()

    deleteRoutine('y')
    await flush(500)
    expect(server.pushes).toEqual(['u1:x', 'u1:y', 'u1:x'])
    expect(storedRoutines().find((r) => r.id === 'x')).toMatchObject({
      dirty: false,
      syncError: null,
    })
  })

  it('서버가 거절해 지운 기록은 몇 건인지 알린다 — 조용히 사라지지 않게', async () => {
    const { startSync, getDroppedWorkouts } = await freshEngine()
    seed([], [log('w', { dirty: true }), log('v', { dirty: true })], 'u1')
    const server = fakeServer()
    server.willRespond(
      { ok: false, kind: 'rejected', reason: '운동 기록은 하루 20건까지 저장할 수 있어요' },
      { ok: false, kind: 'rejected', reason: '운동 기록은 하루 20건까지 저장할 수 있어요' },
    )
    stop = startSync(fakeAuth('u1').auth, server.io)
    await flush()
    expect(storedWorkouts()).toEqual([])
    expect(getDroppedWorkouts()).toEqual({
      count: 2,
      reason: '운동 기록은 하루 20건까지 저장할 수 있어요',
    })
  })
})
