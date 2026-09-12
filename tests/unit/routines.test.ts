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

beforeEach(() => {
  installBrowserStub()
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
    expect(createRoutine('   ').name).toBe('새 루틴')
  })

  it('영상을 담고, 같은 영상은 두 번 담기지 않는다', async () => {
    const { createRoutine, addVideoToRoutine, getRoutine } = await freshModule()
    const routine = createRoutine('가슴')

    expect(addVideoToRoutine(routine.id, video('bench'))).toBe('added')
    expect(addVideoToRoutine(routine.id, video('bench'))).toBe('duplicate')
    expect(getRoutine(routine.id)?.items).toHaveLength(1)
  })

  it('담은 순서를 유지한다', async () => {
    const { createRoutine, addVideoToRoutine, getRoutine } = await freshModule()
    const routine = createRoutine('가슴')
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
    const routine = createRoutine('가슴')
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
    const routine = createRoutine('가슴')
    for (const id of ['bench', 'incline']) addVideoToRoutine(routine.id, video(id))

    moveVideoInRoutine(routine.id, 'bench', -1)
    expect(getRoutine(routine.id)?.items.map((item) => item.id)).toEqual(['bench', 'incline'])
  })

  it('영상과 루틴을 지운다', async () => {
    const { createRoutine, addVideoToRoutine, removeVideoFromRoutine, deleteRoutine, loadRoutines } =
      await freshModule()
    const routine = createRoutine('가슴')
    addVideoToRoutine(routine.id, video('bench'))

    removeVideoFromRoutine(routine.id, 'bench')
    expect(loadRoutines()[0].items).toEqual([])

    deleteRoutine(routine.id)
    expect(loadRoutines()).toEqual([])
  })

  it('이름을 바꾸되 빈 이름은 무시한다', async () => {
    const { createRoutine, renameRoutine, getRoutine } = await freshModule()
    const routine = createRoutine('가슴')

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

  it('저장값이 깨져 있어도 앱을 죽이지 않는다', async () => {
    const store = installBrowserStub()
    store.set('health-shorts:routines:v1', '{ 이건 JSON 이 아니다')
    const { loadRoutines } = await freshModule()
    expect(loadRoutines()).toEqual([])
  })

  it('루틴 모양이 아닌 값은 걸러낸다', async () => {
    const store = installBrowserStub()
    store.set('health-shorts:routines:v1', JSON.stringify([{ id: 'x' }, null, 3]))
    const { loadRoutines } = await freshModule()
    expect(loadRoutines()).toEqual([])
  })

  it('지운 루틴을 있던 자리에 되돌린다', async () => {
    const { createRoutine, deleteRoutine, restoreRoutine, loadRoutines } = await freshModule()
    createRoutine('가슴')
    const middle = createRoutine('등')
    createRoutine('하체')

    const deleted = deleteRoutine(middle.id)
    expect(deleted).not.toBeNull()
    expect(loadRoutines().map((r) => r.name)).toEqual(['가슴', '하체'])

    restoreRoutine(deleted!.routine, deleted!.index)
    // 끝에 붙이면 목록 순서가 흔들린다. 있던 자리로 돌아와야 한다.
    expect(loadRoutines().map((r) => r.name)).toEqual(['가슴', '등', '하체'])
  })

  it('없는 루틴을 지우면 되돌릴 것이 없다고 알린다', async () => {
    const { deleteRoutine } = await freshModule()
    expect(deleteRoutine('없는id')).toBeNull()
  })

  it('되돌리기를 두 번 해도 루틴이 복제되지 않는다', async () => {
    const { createRoutine, deleteRoutine, restoreRoutine, loadRoutines } = await freshModule()
    const routine = createRoutine('가슴')
    const deleted = deleteRoutine(routine.id)!

    restoreRoutine(deleted.routine, deleted.index)
    restoreRoutine(deleted.routine, deleted.index)

    expect(loadRoutines()).toHaveLength(1)
  })

  it('저장에 실패하면 담기지 않았다고 알린다', async () => {
    installBrowserStub()
    const { createRoutine, addVideoToRoutine } = await freshModule()
    const routine = createRoutine('가슴')

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
})
