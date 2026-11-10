import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ShortVideo } from '@/lib/types'

/**
 * vitest 환경이 node 라 localStorage 가 없다. jsdom 을 새로 붙이는 대신
 * routines.ts 가 실제로 쓰는 것(localStorage, addEventListener)만 흉내 낸다.
 * 저장소 구현을 바꿔도 이 스텁이 계약을 그대로 검증한다.
 */
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
  return store
}

/** 모듈 수준 캐시 때문에 테스트마다 새로 import 해야 한다. */
async function freshModule() {
  vi.resetModules()
  return import('@/features/routines/routines')
}

const video = (id: string): ShortVideo => ({
  id,
  title: `${id} 자세`,
  channelTitle: '헬스톡',
  thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
  durationSeconds: 45,
})

let store: Map<string, string>

beforeEach(() => {
  store = installBrowserStub()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('루틴 저장소', () => {
  it('처음에는 비어 있다', async () => {
    const { loadRoutines } = await freshModule()
    expect(loadRoutines()).toEqual([])
  })

  it('루틴을 만들고 다시 읽는다', async () => {
    const { createRoutine, loadRoutines } = await freshModule()
    createRoutine('가슴 루틴')
    expect(loadRoutines().map((routine) => routine.name)).toEqual(['가슴 루틴'])
  })

  it('이름이 비면 기본 이름을 쓴다', async () => {
    const { createRoutine } = await freshModule()
    expect(createRoutine('   ')!.name).toBe('새 루틴')
  })

  it('영상을 담고, 같은 영상은 두 번 담기지 않는다', async () => {
    const { createRoutine, addVideoToRoutine, getRoutine } = await freshModule()
    const routine = createRoutine('가슴')!

    expect(addVideoToRoutine(routine.id, video('bench'))).toBe('added')
    expect(addVideoToRoutine(routine.id, video('bench'))).toBe('duplicate')
    expect(getRoutine(routine.id)?.items).toHaveLength(1)
  })

  it('담은 순서를 유지한다', async () => {
    const { createRoutine, addVideoToRoutine, getRoutine } = await freshModule()
    const routine = createRoutine('가슴')!
    for (const id of ['bench', 'incline', 'fly']) addVideoToRoutine(routine.id, video(id))

    expect(getRoutine(routine.id)?.items.map((item) => item.id)).toEqual([
      'bench',
      'incline',
      'fly',
    ])
  })

  it('운동 순서를 한 칸씩 옮긴다', async () => {
    const { createRoutine, addVideoToRoutine, moveVideoInRoutine, getRoutine } =
      await freshModule()
    const routine = createRoutine('가슴')!
    for (const id of ['bench', 'incline', 'fly']) addVideoToRoutine(routine.id, video(id))

    moveVideoInRoutine(routine.id, 'fly', -1)
    expect(getRoutine(routine.id)?.items.map((item) => item.id)).toEqual([
      'bench',
      'fly',
      'incline',
    ])
  })

  it('끝에서 더 옮기려 하면 아무 일도 하지 않는다', async () => {
    const { createRoutine, addVideoToRoutine, moveVideoInRoutine, getRoutine } =
      await freshModule()
    const routine = createRoutine('가슴')!
    for (const id of ['bench', 'incline']) addVideoToRoutine(routine.id, video(id))

    moveVideoInRoutine(routine.id, 'bench', -1)
    expect(getRoutine(routine.id)?.items.map((item) => item.id)).toEqual(['bench', 'incline'])
  })

  it('영상과 루틴을 지운다', async () => {
    const { createRoutine, addVideoToRoutine, removeVideoFromRoutine, deleteRoutine, loadRoutines } =
      await freshModule()
    const routine = createRoutine('가슴')!
    addVideoToRoutine(routine.id, video('bench'))

    removeVideoFromRoutine(routine.id, 'bench')
    expect(loadRoutines()[0].items).toEqual([])

    deleteRoutine(routine.id)
    expect(loadRoutines()).toEqual([])
  })

  it('이름을 바꾸되 빈 이름은 무시한다', async () => {
    const { createRoutine, renameRoutine, getRoutine } = await freshModule()
    const routine = createRoutine('가슴')!

    renameRoutine(routine.id, '  등 루틴 ')
    expect(getRoutine(routine.id)?.name).toBe('등 루틴')

    renameRoutine(routine.id, '   ')
    expect(getRoutine(routine.id)?.name).toBe('등 루틴')
  })

  it('바뀌지 않았으면 같은 배열 참조를 돌려준다', async () => {
    // useSyncExternalStore 가 참조로 변경을 판단한다. 매번 새 배열이면 무한 렌더에 빠진다.
    const { createRoutine, loadRoutines } = await freshModule()
    createRoutine('가슴')
    expect(loadRoutines()).toBe(loadRoutines())
  })

  // 앞의 두 v1 시드는 v1 → v2 이전 경로를, 뒤의 두 v2 시드는 v2 읽기 경로를 검증한다.
  it('저장값이 깨져 있어도 앱을 죽이지 않는다', async () => {
    store.set('health-shorts:routines:v1', '{ 이건 JSON 이 아니다')
    const { loadRoutines } = await freshModule()
    expect(loadRoutines()).toEqual([])
  })

  it('루틴 모양이 아닌 값은 걸러낸다', async () => {
    store.set('health-shorts:routines:v1', JSON.stringify([{ id: 'x' }, null, 3]))
    const { loadRoutines } = await freshModule()
    expect(loadRoutines()).toEqual([])
  })

  it('v2 저장값이 깨져 있어도 앱을 죽이지 않는다', async () => {
    store.set('health-shorts:routines:v2', '{ 이건 JSON 이 아니다')
    const { loadRoutines } = await freshModule()
    expect(loadRoutines()).toEqual([])
  })

  it('v2 에서도 루틴 모양이 아닌 값은 걸러낸다', async () => {
    store.set('health-shorts:routines:v2', JSON.stringify([{ id: 'x' }, null, 3]))
    const { loadRoutines } = await freshModule()
    expect(loadRoutines()).toEqual([])
  })

  it('지운 루틴을 있던 자리에 되돌린다', async () => {
    const { createRoutine, deleteRoutine, restoreRoutine, loadRoutines } = await freshModule()
    createRoutine('가슴')
    const middle = createRoutine('등')!
    createRoutine('하체')

    const deleted = deleteRoutine(middle.id)
    expect(deleted).not.toBeNull()
    expect(loadRoutines().map((r) => r.name)).toEqual(['가슴', '하체'])

    restoreRoutine(deleted!.routine, deleted!.index, deleted!.owner)
    // 끝에 붙이면 목록 순서가 흔들린다. 있던 자리로 돌아와야 한다.
    expect(loadRoutines().map((r) => r.name)).toEqual(['가슴', '등', '하체'])
  })

  it('없는 루틴을 지우면 되돌릴 것이 없다고 알린다', async () => {
    const { deleteRoutine } = await freshModule()
    expect(deleteRoutine('없는id')).toBeNull()
  })

  it('되돌리기를 두 번 해도 루틴이 복제되지 않는다', async () => {
    const { createRoutine, deleteRoutine, restoreRoutine, loadRoutines } = await freshModule()
    const routine = createRoutine('가슴')!
    const deleted = deleteRoutine(routine.id)!

    restoreRoutine(deleted.routine, deleted.index, deleted.owner)
    restoreRoutine(deleted.routine, deleted.index, deleted.owner)

    expect(loadRoutines()).toHaveLength(1)
  })

  it('저장에 실패하면 담기지 않았다고 알린다', async () => {
    installBrowserStub()
    const { createRoutine, addVideoToRoutine } = await freshModule()
    const routine = createRoutine('가슴')!

    // 용량 초과를 흉내 낸다. 예전에는 이 예외를 삼켜서 화면에는 담긴 것처럼 보이고
    // 새로고침하면 사라졌다.
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => JSON.stringify([routine]),
        setItem: () => {
          throw new DOMException('QuotaExceededError')
        },
        removeItem: () => {},
      },
      addEventListener: () => {},
      removeEventListener: () => {},
    })

    expect(addVideoToRoutine(routine.id, video('bench'))).toBe('failed')
  })

  it('대상 루틴이 없으면 담기 실패다', async () => {
    const { addVideoToRoutine } = await freshModule()
    expect(addVideoToRoutine('없는id', video('bench'))).toBe('failed')
  })

  it('변경되면 구독자에게 알린다', async () => {
    const { subscribeRoutines, createRoutine } = await freshModule()
    const listener = vi.fn()
    const unsubscribe = subscribeRoutines(listener)

    createRoutine('가슴')
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    createRoutine('등')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('v1 을 v2 로 옮기고 긴 이름을 자른다', async () => {
    store.set(
      'health-shorts:routines:v1',
      JSON.stringify([{ id: 'r1', name: 'x'.repeat(80), createdAt: 5, items: [] }]),
    )
    const { loadStoredRoutines } = await freshModule()
    expect(loadStoredRoutines()[0]).toMatchObject({
      id: 'r1',
      updatedAt: 5,
      owner: null,
      deletedAt: null,
      dirty: false,
      syncError: null,
    })
    expect(loadStoredRoutines()[0].name).toHaveLength(60)
    // v2 에 쓰고, v1 은 되돌아갈 길로 남긴다.
    expect(store.has('health-shorts:routines:v2')).toBe(true)
    expect(store.has('health-shorts:routines:v1')).toBe(true)
  })

  it('다른 주인의 루틴은 보이지 않는다', async () => {
    const m = await freshModule()
    m.createRoutine('손님 루틴')
    m.setActiveOwner('u1')
    expect(m.getActiveOwner()).toBe('u1')
    expect(m.loadRoutines()).toEqual([])
    m.createRoutine('내 루틴')
    expect(m.loadRoutines().map((r) => r.name)).toEqual(['내 루틴'])
    m.setActiveOwner(null)
    expect(m.loadRoutines().map((r) => r.name)).toEqual(['손님 루틴'])
  })

  it('주인이 바뀌면 구독자에게 알린다', async () => {
    const m = await freshModule()
    const listener = vi.fn()
    m.subscribeRoutines(listener)
    m.setActiveOwner('u1')
    expect(listener).toHaveBeenCalledTimes(1)
    m.setActiveOwner('u1')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('로그인 중 변경은 dirty, 비로그인 변경은 아니다', async () => {
    const m = await freshModule()
    m.createRoutine('손님')
    expect(m.loadStoredRoutines()[0]).toMatchObject({ dirty: false, owner: null })

    m.setActiveOwner('u1')
    const mine = m.createRoutine('내 루틴')!
    const stored = m.loadStoredRoutines().find((r) => r.id === mine.id)!
    expect(stored).toMatchObject({ dirty: true, owner: 'u1', syncError: null })
  })

  it('변경하면 updatedAt 이 지금으로 바뀌고 syncError 가 지워진다', async () => {
    const m = await freshModule()
    m.setActiveOwner('u1')
    const r = m.createRoutine('가슴')!
    m.replaceStoredRoutines(
      m.loadStoredRoutines().map((s) => ({ ...s, updatedAt: 1, dirty: false, syncError: '실패' })),
    )
    m.renameRoutine(r.id, '등')
    expect(m.loadStoredRoutines()[0]).toMatchObject({ name: '등', dirty: true, syncError: null })
    expect(m.loadStoredRoutines()[0].updatedAt).toBeGreaterThan(1)
  })

  it('로그인 중 지우면 묘비가 되고 되돌리면 dirty 로 살아난다', async () => {
    const m = await freshModule()
    m.setActiveOwner('u1')
    const r = m.createRoutine('가슴')!
    const deleted = m.deleteRoutine(r.id)!
    expect(m.loadRoutines()).toEqual([])
    expect(m.loadStoredRoutines()[0].deletedAt).not.toBeNull()
    m.restoreRoutine(deleted.routine, deleted.index, deleted.owner)
    expect(m.loadStoredRoutines()).toHaveLength(1)
    expect(m.loadStoredRoutines()[0]).toMatchObject({ deletedAt: null, dirty: true, owner: 'u1' })
    expect(m.loadRoutines().map((x) => x.name)).toEqual(['가슴'])
  })

  it('지울 때의 주인을 함께 돌려준다', async () => {
    const m = await freshModule()
    m.setActiveOwner('u1')
    const r = m.createRoutine('가슴')!
    expect(m.deleteRoutine(r.id)).toMatchObject({ index: 0, owner: 'u1' })
  })

  it('지운 뒤 다른 계정으로 바뀌면 되돌리지 않는다', async () => {
    // A 가 지우고 로그아웃, B 가 로그인한 뒤 되돌리기를 누른 경우. 그대로 되살리면
    // A 의 루틴이 B 의 것으로 dirty 가 되어 B 계정에 올라간다.
    const m = await freshModule()
    m.setActiveOwner('a')
    const r = m.createRoutine('A 의 루틴')!
    const deleted = m.deleteRoutine(r.id)!
    m.setActiveOwner(null)
    m.setActiveOwner('b')
    const before = m.loadStoredRoutines()

    expect(m.restoreRoutine(deleted.routine, deleted.index, deleted.owner)).toBe(false)
    expect(m.loadStoredRoutines()).toBe(before)
    expect(m.loadStoredRoutines()[0]).toMatchObject({ owner: 'a' })
    expect(m.loadStoredRoutines()[0].deletedAt).not.toBeNull()
    expect(m.loadRoutines()).toEqual([])
  })

  it('비로그인으로 지운 뒤 로그인하면 되돌리지 않는다', async () => {
    // 손님 루틴이 가져오기 동의 없이 계정에 들어가면 안 된다.
    const m = await freshModule()
    const r = m.createRoutine('손님 루틴')!
    const deleted = m.deleteRoutine(r.id)!
    m.setActiveOwner('u1')

    expect(m.restoreRoutine(deleted.routine, deleted.index, deleted.owner)).toBe(false)
    expect(m.loadStoredRoutines()).toEqual([])
    expect(m.loadRoutines()).toEqual([])
  })

  it('주인이 다른 묘비는 넘겨받은 주인이 맞아도 되살리지 않는다', async () => {
    const m = await freshModule()
    m.setActiveOwner('a')
    const r = m.createRoutine('A 의 루틴')!
    const deleted = m.deleteRoutine(r.id)!
    m.setActiveOwner('b')

    expect(m.restoreRoutine(deleted.routine, deleted.index, 'b')).toBe(false)
    expect(m.loadStoredRoutines()).toHaveLength(1)
    expect(m.loadStoredRoutines()[0]).toMatchObject({ owner: 'a', dirty: true })
    expect(m.loadStoredRoutines()[0].deletedAt).not.toBeNull()
  })

  it('비로그인 루틴을 지우면 배열에서 빠진다', async () => {
    const m = await freshModule()
    const r = m.createRoutine('가슴')!
    m.deleteRoutine(r.id)
    expect(m.loadStoredRoutines()).toEqual([])
  })

  it('담을 때 휴식 시간을 추천값으로 채운다', async () => {
    const m = await freshModule()
    const r = m.createRoutine('코어')!
    m.addVideoToRoutine(r.id, { ...video('plank'), title: '플랭크 30초' })
    expect(m.getRoutine(r.id)?.items[0].restSeconds).toBe(30)
  })

  it('v1 항목에 휴식 시간을 채우고 이상한 값은 추천값으로 되돌린다', async () => {
    store.set(
      'health-shorts:routines:v1',
      JSON.stringify([
        { id: 'r1', name: '하체', createdAt: 1, items: [{ ...video('sq'), title: '스쿼트' }] },
      ]),
    )
    const first = await freshModule()
    expect(first.loadRoutines()[0].items[0].restSeconds).toBe(90)

    store.clear()
    store.set(
      'health-shorts:routines:v2',
      JSON.stringify([
        {
          id: 'r2',
          name: '코어',
          createdAt: 1,
          updatedAt: 1,
          deletedAt: null,
          owner: null,
          dirty: false,
          syncError: null,
          items: [
            { ...video('plank'), title: '플랭크', restSeconds: 'x' },
            { ...video('curl'), title: '바벨 컬', restSeconds: 9999 },
            { ...video('row'), title: '로우', restSeconds: 44 },
          ],
        },
      ]),
    )
    const second = await freshModule()
    expect(second.loadRoutines()[0].items.map((i) => i.restSeconds)).toEqual([30, 60, 40])
  })

  it('휴식 시간을 바꾸면 10초 단위로 저장된다', async () => {
    const m = await freshModule()
    m.setActiveOwner('u1')
    const r = m.createRoutine('가슴')!
    m.addVideoToRoutine(r.id, video('bench'))
    m.replaceStoredRoutines(m.loadStoredRoutines().map((s) => ({ ...s, dirty: false })))

    expect(m.setItemRest(r.id, 'bench', 95)).toBe(true)
    expect(m.getRoutine(r.id)?.items[0].restSeconds).toBe(100)
    expect(m.loadStoredRoutines()[0].dirty).toBe(true)

    expect(m.setItemRest(r.id, 'bench', 9999)).toBe(true)
    expect(m.getRoutine(r.id)?.items[0].restSeconds).toBe(300)
    expect(m.setItemRest(r.id, '없는영상', 30)).toBe(false)
  })

  it('루틴당 100개를 넘겨 담지 않는다', async () => {
    const m = await freshModule()
    const r = m.createRoutine('많이')!
    for (let i = 0; i < m.LIMITS.items; i++) {
      expect(m.addVideoToRoutine(r.id, video(`v${i}`))).toBe('added')
    }
    expect(m.addVideoToRoutine(r.id, video('v100'))).toBe('full')
    expect(m.getRoutine(r.id)?.items).toHaveLength(100)
  })

  it('살아 있는 루틴이 200개면 더 만들지 않는다', async () => {
    const m = await freshModule()
    m.setActiveOwner('u1')
    let last: ReturnType<typeof m.createRoutine> = null
    for (let i = 0; i < m.LIMITS.routines; i++) last = m.createRoutine(`r${i}`)
    expect(last).not.toBeNull()
    expect(m.createRoutine('하나 더')).toBeNull()

    // 묘비는 세지 않는다.
    m.deleteRoutine(last!.id)
    expect(m.createRoutine('하나 더')).not.toBeNull()
  })

  it('이름은 60자까지만 저장한다', async () => {
    const m = await freshModule()
    const r = m.createRoutine('가'.repeat(80))!
    expect(r.name).toHaveLength(60)
    m.renameRoutine(r.id, '나'.repeat(70))
    expect(m.getRoutine(r.id)?.name).toHaveLength(60)
  })

  it('주인을 오가도 바뀌지 않았으면 같은 참조를 돌려준다', async () => {
    const m = await freshModule()
    m.createRoutine('가슴')
    m.setActiveOwner('u1')
    m.createRoutine('등')
    expect(m.loadRoutines()).toBe(m.loadRoutines())
    m.setActiveOwner(null)
    expect(m.loadRoutines()).toBe(m.loadRoutines())
    expect(m.loadRoutines().map((r) => r.name)).toEqual(['가슴'])
  })

  it('초기화하면 v1·v2 와 주인을 함께 되돌린다', async () => {
    store.set('health-shorts:routines:v1', '[]')
    const m = await freshModule()
    m.setActiveOwner('u1')
    m.createRoutine('가슴')
    m.resetRoutinesForTest()
    expect(store.has('health-shorts:routines:v1')).toBe(false)
    expect(store.has('health-shorts:routines:v2')).toBe(false)
    expect(m.getActiveOwner()).toBeNull()
  })
})
