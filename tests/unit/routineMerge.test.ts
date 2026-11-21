import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StoredRoutine } from '@/features/routines/routines'
import type { WorkoutLog } from '@/features/workouts/workouts'
import {
  adoptGuestRoutines,
  adoptGuestWorkouts,
  classifySessionChange,
  cleanupAfterSignOut,
  cleanupWorkoutsAfterSignOut,
  mergeRoutines,
  mergeWorkouts,
} from '@/features/routines/merge'

function make(id: string, over: Partial<StoredRoutine> = {}): StoredRoutine {
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

describe('mergeRoutines', () => {
  it('서버에 없는 로컬 루틴의 지난 거절은 당길 때 지운다 — 다른 기기에서 지워 상한이 풀렸을 수 있다', () => {
    const local = [make('x', { dirty: true, syncError: '루틴은 200개까지 저장할 수 있어요' })]
    expect(mergeRoutines(local, [], 'u1')[0]).toMatchObject({ dirty: true, syncError: null })
  })

  it('서버에만 있는 루틴은 서버 순서(position)대로 붙인다', () => {
    const remote = [
      make('b', { createdAt: 1, syncedPosition: 1 }),
      make('a', { createdAt: 2, syncedPosition: 0 }),
    ]
    expect(mergeRoutines([], remote, 'u1').map((r) => r.id)).toEqual(['a', 'b'])
  })

  it('로컬이 이겨도 서버에 지금 있는 자리를 기억한다', () => {
    const local = [make('a', { updatedAt: 20, dirty: true, syncedPosition: 5 })]
    const remote = [make('a', { updatedAt: 10, syncedPosition: 2 })]
    expect(mergeRoutines(local, remote, 'u1')[0].syncedPosition).toBe(2)
  })

  it('나중에 고친 쪽이 이긴다', () => {
    const local = [make('a', { name: '로컬', updatedAt: 10, dirty: true })]
    const remote = [make('a', { name: '서버', updatedAt: 20 })]
    const [merged] = mergeRoutines(local, remote, 'u1')
    expect(merged.name).toBe('서버')
    expect(merged.dirty).toBe(false)
    expect(merged.owner).toBe('u1')
    expect(merged.syncError).toBeNull()
  })

  it('updatedAt 이 같으면 remote 가 이긴다', () => {
    const local = [make('a', { name: '로컬', updatedAt: 20 })]
    const remote = [make('a', { name: '서버', updatedAt: 20 })]
    expect(mergeRoutines(local, remote, 'u1')[0].name).toBe('서버')
  })

  it('로컬이 이기면 dirty 로 표시한다', () => {
    const local = [make('a', { name: '로컬', updatedAt: 30, syncError: 'x' })]
    const remote = [make('a', { name: '서버', updatedAt: 20 })]
    const [merged] = mergeRoutines(local, remote, 'u1')
    expect(merged.name).toBe('로컬')
    expect(merged.dirty).toBe(true)
    expect(merged.syncError).toBe('x')
  })

  it('updatedAt 이 같으면 remote 가 이기고 dirty 가 아니다 — 로컬이 더 나중이면 dirty 다', () => {
    const local = [make('a', { updatedAt: 30 })]
    const remote = [make('a', { updatedAt: 20 })]
    // updatedAt 만 다르면 "다르다" — 서버에 올려 맞춰야 한다.
    expect(mergeRoutines(local, remote, 'u1')[0].dirty).toBe(true)
    const same = mergeRoutines([make('a', { updatedAt: 30 })], [make('a', { updatedAt: 30 })], 'u1')
    expect(same[0].dirty).toBe(false)
  })

  it('지운 것이 나중이면 지워지고, 고친 것이 나중이면 되살아난다', () => {
    const tomb = make('a', { deletedAt: 25, updatedAt: 25 })
    const live = make('a', { name: '살아있음', updatedAt: 30 })
    const older = make('a', { updatedAt: 20 })

    const deleted = mergeRoutines([older], [tomb], 'u1')[0]
    expect(deleted.deletedAt).toBe(25)

    const revived = mergeRoutines([live], [tomb], 'u1')[0]
    expect(revived.deletedAt).toBeNull()
    expect(revived.dirty).toBe(true)

    const localTomb = mergeRoutines([tomb], [older], 'u1')[0]
    expect(localTomb.deletedAt).toBe(25)
    expect(localTomb.dirty).toBe(true)
  })

  it('서버에 없는 로컬 묘비가 dirty 가 아니면 버린다 — 서버가 30일 지나 정리한 것이다', () => {
    const pruned = make('t', { deletedAt: 5, updatedAt: 5, dirty: false })
    const live = make('l')
    const merged = mergeRoutines([pruned, live], [], 'u1')
    expect(merged.map((r) => r.id)).toEqual(['l'])
  })

  it('서버에 없는 로컬 묘비가 dirty 면 남겨 올린다', () => {
    const pending = make('t', { deletedAt: 5, updatedAt: 5, dirty: true })
    const [merged] = mergeRoutines([pending], [], 'u1')
    expect(merged).toMatchObject({ id: 't', deletedAt: 5, dirty: true })
  })

  it('다른 주인의 묘비는 서버에 없어도 버리지 않는다', () => {
    const otherTomb = make('t', { owner: 'u2', deletedAt: 5, dirty: false })
    expect(mergeRoutines([otherTomb], [], 'u1')).toEqual([otherTomb])
  })

  it('한쪽에만 있는 루틴은 남는다', () => {
    const local = [make('l', { updatedAt: 5 })]
    const remote = [make('r', { createdAt: 3, owner: null, dirty: true, syncError: 'e' })]
    const merged = mergeRoutines(local, remote, 'u1')
    expect(merged.map((r) => r.id)).toEqual(['l', 'r'])
    expect(merged[0].dirty).toBe(true) // 서버에 없는 로컬 루틴은 올려야 한다
    expect(merged[1]).toMatchObject({ owner: 'u1', dirty: false, syncError: null })
  })

  it('다른 주인의 로컬 루틴은 건드리지 않는다', () => {
    const guest = make('g', { owner: null, dirty: false })
    const other = make('o', { owner: 'u2', dirty: true })
    const remote = [make('g', { name: '서버', updatedAt: 99 })]
    const merged = mergeRoutines([guest, other], remote, 'u1')
    expect(merged).toContainEqual(guest)
    expect(merged).toContainEqual(other)
  })

  it('순서는 로컬 순서를 유지하고 remote 전용은 createdAt 순으로 뒤에 붙인다', () => {
    const local = [make('b'), make('a')]
    const remote = [make('z', { createdAt: 9 }), make('y', { createdAt: 2 }), make('a')]
    expect(mergeRoutines(local, remote, 'u1').map((r) => r.id)).toEqual(['b', 'a', 'y', 'z'])
  })

  it('입력을 바꾸지 않는다', () => {
    const local = [make('a', { updatedAt: 30 })]
    const remote = [make('a', { updatedAt: 20 })]
    const l = structuredClone(local)
    const r = structuredClone(remote)
    mergeRoutines(local, remote, 'u1')
    expect(local).toEqual(l)
    expect(remote).toEqual(r)
  })
})

describe('adoptGuestRoutines', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(1000)
  })
  afterEach(() => vi.useRealTimers())

  it('손님 루틴을 가져오면 내 것이 되고 dirty 다', () => {
    const guest = make('g', { owner: null, updatedAt: 5 })
    const tomb = make('t', { owner: null, deletedAt: 3 })
    const other = make('o', { owner: 'u2' })
    const result = adoptGuestRoutines([guest, tomb, other], 'u1')
    expect(result.map((r) => r.id)).toEqual(['g', 'o'])
    expect(result[0]).toMatchObject({ owner: 'u1', dirty: true, updatedAt: 1000 })
    expect(result[1]).toEqual(other)
    expect(guest.owner).toBeNull()
  })
})

describe('cleanupAfterSignOut', () => {
  it('로그아웃하면 반영된 것만 지우고 못 민 것은 남긴다', () => {
    const synced = make('s')
    const syncedTomb = make('t', { deletedAt: 5 })
    const pending = make('p', { dirty: true })
    const other = make('o', { owner: 'u2' })
    const guest = make('g', { owner: null })
    expect(cleanupAfterSignOut([synced, syncedTomb, pending, other, guest], 'u1')).toEqual([
      pending,
      other,
      guest,
    ])
  })
})

describe('classifySessionChange', () => {
  it('세션 변화를 구분한다', () => {
    expect(classifySessionChange(null, null)).toEqual({ kind: 'none' })
    expect(classifySessionChange(null, 'u1')).toEqual({ kind: 'signed-in', userId: 'u1' })
    expect(classifySessionChange('u1', null)).toEqual({ kind: 'signed-out', previous: 'u1' })
    expect(classifySessionChange('u1', 'u2')).toEqual({
      kind: 'switched',
      previous: 'u1',
      userId: 'u2',
    })
    expect(classifySessionChange('u1', 'u1')).toEqual({ kind: 'none' })
  })
})

function log(id: string, over: Partial<WorkoutLog> = {}): WorkoutLog {
  return {
    id,
    routineId: 'r1',
    routineName: '하체',
    completedAt: 10,
    localDate: '2026-11-12',
    owner: 'u1',
    dirty: false,
    ...over,
  }
}

describe('mergeWorkouts', () => {
  it('id 합집합이다 — 서버에만 있는 기록은 뒤에 completedAt 순으로 붙는다', () => {
    const local = [log('a', { dirty: true })]
    const remote = [log('c', { completedAt: 30 }), log('a'), log('b', { completedAt: 20 })]
    const merged = mergeWorkouts(local, remote, 'u1')
    expect(merged.map((item) => item.id)).toEqual(['a', 'b', 'c'])
    expect(merged.every((item) => item.owner === 'u1' && !item.dirty)).toBe(true)
  })

  it('서버에 없는 로컬 기록은 dirty 로 남긴다', () => {
    const merged = mergeWorkouts([log('a')], [], 'u1')
    expect(merged).toEqual([log('a', { dirty: true })])
  })

  it('다른 주인과 손님 기록은 건드리지 않는다', () => {
    const other = log('x', { owner: 'u2' })
    const guest = log('g', { owner: null })
    const merged = mergeWorkouts([other, guest], [log('x'), log('g')], 'u1')
    // 서버의 x·g 는 u1 의 것이므로 따로 붙는다 — 로컬의 남의 기록과 섞이지 않는다.
    expect(merged.slice(0, 2)).toEqual([other, guest])
    expect(merged.slice(2).map((item) => item.owner)).toEqual(['u1', 'u1'])
  })

  it('입력을 바꾸지 않는다', () => {
    const local = [log('a')]
    mergeWorkouts(local, [], 'u1')
    expect(local[0].dirty).toBe(false)
  })
})

describe('adoptGuestWorkouts', () => {
  it('손님 기록을 이 계정의 dirty 기록으로 바꾸고 남의 것은 둔다', () => {
    const guest = log('g', { owner: null })
    const other = log('x', { owner: 'u2' })
    expect(adoptGuestWorkouts([guest, other], 'u1')).toEqual({
      workouts: [log('g', { owner: 'u1', dirty: true }), other],
      dropped: 0,
    })
  })

  it('계정 기록과 합쳐 하루 상한을 넘는 손님 기록은 가져오지 않고 몇 건인지 알려 준다', () => {
    const day = '2026-11-10'
    const mine = Array.from({ length: 19 }, (_, i) => log(`m${i}`, { localDate: day }))
    const guests = [
      log('g1', { owner: null, localDate: day }),
      log('g2', { owner: null, localDate: day }),
      log('g3', { owner: null, localDate: '2026-11-11' }),
      log('g4', { owner: null, localDate: day }),
    ]
    const { workouts, dropped } = adoptGuestWorkouts([...mine, ...guests], 'u1')
    expect(dropped).toBe(2)
    expect(workouts.filter((l) => l.owner === null)).toEqual([])
    expect(workouts.filter((l) => l.id.startsWith('g')).map((l) => l.id)).toEqual(['g1', 'g3'])
  })
})

describe('cleanupWorkoutsAfterSignOut', () => {
  it('그 계정의 올린 기록만 지우고 못 올린 기록은 남긴다', () => {
    const synced = log('a')
    const pending = log('b', { dirty: true })
    const other = log('x', { owner: 'u2' })
    const guest = log('g', { owner: null })
    expect(cleanupWorkoutsAfterSignOut([synced, pending, other, guest], 'u1')).toEqual([
      pending,
      other,
      guest,
    ])
  })
})
