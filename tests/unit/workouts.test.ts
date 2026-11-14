import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** routines.test.ts 와 같은 스텁 — 저장소가 실제로 쓰는 것만 흉내 낸다. */
function installBrowserStub() {
  const store = new Map<string, string>()
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  }
  vi.stubGlobal('window', {
    localStorage: storage,
    addEventListener: () => {},
    removeEventListener: () => {},
  })
  return { store, storage }
}

/** 모듈 수준 캐시와 화면 주인 때문에 테스트마다 두 저장소를 함께 새로 import 한다. */
async function freshModules() {
  vi.resetModules()
  const routines = await import('@/features/routines/routines')
  const workouts = await import('@/features/workouts/workouts')
  return { ...routines, ...workouts }
}

const KEY = 'health-shorts:workouts:v1'
const routine = { id: 'r1', name: '하체 루틴' }

let store: Map<string, string>
let storage: ReturnType<typeof installBrowserStub>['storage']

beforeEach(() => {
  ;({ store, storage } = installBrowserStub())
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 10, 12, 23, 30))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('운동 기록 저장소', () => {
  it('처음에는 비어 있다', async () => {
    const { loadWorkouts } = await freshModules()
    expect(loadWorkouts()).toEqual([])
  })

  it('기록에 현지 날짜와 루틴 이름을 남긴다', async () => {
    const { recordWorkout, loadWorkouts } = await freshModules()
    expect(recordWorkout(routine)).toBe('recorded')

    const [log] = loadWorkouts()
    expect(log).toMatchObject({
      routineId: 'r1',
      routineName: '하체 루틴',
      completedAt: new Date(2026, 10, 12, 23, 30).getTime(),
      // 밤 11시 반이라도 UTC 가 아니라 기기 달력 날짜다.
      localDate: '2026-11-12',
      owner: null,
      dirty: false,
    })
    expect(log.id).toMatch(/^w/)
    expect(JSON.parse(store.get(KEY)!)).toHaveLength(1)
  })

  it('now 를 넘기면 그 시각으로 기록한다', async () => {
    const { recordWorkout, loadWorkouts } = await freshModules()
    recordWorkout(routine, new Date(2026, 10, 10, 0, 5))
    expect(loadWorkouts()[0].localDate).toBe('2026-11-10')
  })

  it('루틴 이름은 서버 상한(60자)으로 자른다', async () => {
    const { recordWorkout, loadWorkouts } = await freshModules()
    recordWorkout({ id: 'r1', name: '가'.repeat(80) })
    expect(loadWorkouts()[0].routineName).toHaveLength(60)
  })

  it('루틴 이름을 자를 때 60번째 자리의 이모지를 반으로 가르지 않는다', async () => {
    const { recordWorkout, loadWorkouts } = await freshModules()
    recordWorkout({ id: 'r1', name: '가'.repeat(59) + '💪' + '나'.repeat(10) })
    const name = loadWorkouts()[0].routineName
    expect(Array.from(name)).toHaveLength(60)
    expect(name.endsWith('💪')).toBe(true)
    expect(name.isWellFormed()).toBe(true)
  })

  it('같은 날 20건을 넘기지 않는다', async () => {
    const { recordWorkout, loadWorkouts } = await freshModules()
    for (let i = 0; i < 20; i += 1) expect(recordWorkout(routine)).toBe('recorded')
    expect(recordWorkout(routine)).toBe('limit')
    expect(loadWorkouts()).toHaveLength(20)
    // 다음 날은 다시 기록된다.
    expect(recordWorkout(routine, new Date(2026, 10, 13, 8, 0))).toBe('recorded')
  })

  it('하루 상한은 주인별로 센다', async () => {
    const { recordWorkout, setActiveOwner } = await freshModules()
    for (let i = 0; i < 20; i += 1) recordWorkout(routine)
    setActiveOwner('u1')
    expect(recordWorkout(routine)).toBe('recorded')
  })

  it('로그인 중 기록은 dirty 이고 그 사용자 것이다', async () => {
    const { recordWorkout, loadWorkouts, setActiveOwner } = await freshModules()
    setActiveOwner('u1')
    recordWorkout(routine)
    expect(loadWorkouts()[0]).toMatchObject({ owner: 'u1', dirty: true })
  })

  it('지금 주인의 기록만 보이고, 주인이 바뀌면 다시 거른다', async () => {
    const { recordWorkout, loadWorkouts, loadStoredWorkouts, setActiveOwner } =
      await freshModules()
    recordWorkout(routine)
    setActiveOwner('u1')
    expect(loadWorkouts()).toEqual([])
    recordWorkout(routine)
    expect(loadWorkouts().map((log) => log.owner)).toEqual(['u1'])
    expect(loadStoredWorkouts()).toHaveLength(2)
    setActiveOwner(null)
    expect(loadWorkouts().map((log) => log.owner)).toEqual([null])
  })

  it('바뀐 것이 없으면 같은 참조를 돌려준다', async () => {
    const { recordWorkout, loadWorkouts, setActiveOwner } = await freshModules()
    recordWorkout(routine)
    const first = loadWorkouts()
    expect(loadWorkouts()).toBe(first)
    setActiveOwner('u1')
    expect(loadWorkouts()).not.toBe(first)
    expect(loadWorkouts()).toBe(loadWorkouts())
  })

  it('주인이 바뀌면 구독자에게 알린다', async () => {
    const { subscribeWorkouts, setActiveOwner } = await freshModules()
    const listener = vi.fn()
    const unsubscribe = subscribeWorkouts(listener)
    setActiveOwner('u1')
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
    setActiveOwner(null)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('기록하면 구독자에게 알린다', async () => {
    const { subscribeWorkouts, recordWorkout } = await freshModules()
    const listener = vi.fn()
    subscribeWorkouts(listener)
    recordWorkout(routine)
    expect(listener).toHaveBeenCalled()
  })

  it('저장에 실패하면 failed 이고 기록은 남지 않는다', async () => {
    const { recordWorkout, loadWorkouts } = await freshModules()
    storage.setItem = () => {
      throw new Error('QuotaExceededError')
    }
    expect(recordWorkout(routine)).toBe('failed')
    expect(loadWorkouts()).toEqual([])
  })

  it('손상된 값과 모양이 틀린 항목은 버린다', async () => {
    store.set(
      KEY,
      JSON.stringify([
        { id: 'w1', routineId: 'r1', routineName: '하체', completedAt: 1, localDate: '2026-11-12' },
        { id: 'w2', routineId: 'r1', routineName: '하체', completedAt: 1, localDate: '11/12' },
        { id: 3 },
      ]),
    )
    const { loadWorkouts } = await freshModules()
    expect(loadWorkouts()).toEqual([
      {
        id: 'w1',
        routineId: 'r1',
        routineName: '하체',
        completedAt: 1,
        localDate: '2026-11-12',
        owner: null,
        dirty: false,
      },
    ])
  })

  it('JSON 이 깨져 있으면 빈 목록이다', async () => {
    store.set(KEY, '{not json')
    const { loadWorkouts } = await freshModules()
    expect(loadWorkouts()).toEqual([])
  })

  it('replaceStoredWorkouts 는 통째로 바꾸고 알린다', async () => {
    const { replaceStoredWorkouts, loadStoredWorkouts, subscribeWorkouts } = await freshModules()
    const listener = vi.fn()
    subscribeWorkouts(listener)
    const log = {
      id: 'w9',
      routineId: 'r1',
      routineName: '하체',
      completedAt: 5,
      localDate: '2026-11-01',
      owner: 'u1',
      dirty: false,
    }
    expect(replaceStoredWorkouts([log])).toBe(true)
    expect(loadStoredWorkouts()).toEqual([log])
    expect(listener).toHaveBeenCalled()
  })
})
