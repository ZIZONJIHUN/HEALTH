import { describe, expect, it } from 'vitest'
import type { StoredRoutine } from '@/features/routines/routines'
import type { WorkoutLog } from '@/features/workouts/workouts'
import { needsSignOutConfirm, syncStatusFrom } from '@/features/routines/syncStatus'

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

describe('syncStatusFrom', () => {
  it('주인이 없으면 local 이다 — 손님의 dirty 가 있어도', () => {
    const routines = [routine('a', { owner: null, dirty: true, syncError: '거절' })]
    expect(syncStatusFrom(routines, [log('w', { owner: null, dirty: true })], null)).toEqual({
      state: 'local',
    })
  })

  it('내 것이 모두 올라갔으면 synced 다', () => {
    expect(syncStatusFrom([routine('a')], [log('w')], 'u1')).toEqual({ state: 'synced' })
  })

  it('아무것도 없어도 로그인 상태면 synced 다', () => {
    expect(syncStatusFrom([], [], 'u1')).toEqual({ state: 'synced' })
  })

  it('내 루틴에 dirty 가 있으면 pending 이다', () => {
    expect(syncStatusFrom([routine('a', { dirty: true })], [], 'u1')).toEqual({ state: 'pending' })
  })

  it('내 기록에 dirty 가 있으면 pending 이다', () => {
    expect(syncStatusFrom([routine('a')], [log('w', { dirty: true })], 'u1')).toEqual({
      state: 'pending',
    })
  })

  it('내 루틴에 syncError 가 있으면 rejected 이고 이름과 이유를 담는다', () => {
    const routines = [
      routine('a', { name: '하체', dirty: true, syncError: '루틴 이름은 60자까지예요' }),
      routine('b', { name: '상체', dirty: true, syncError: '루틴 이름은 60자까지예요' }),
      routine('c', { name: '코어' }),
    ]
    expect(syncStatusFrom(routines, [], 'u1')).toEqual({
      state: 'rejected',
      names: ['하체', '상체'],
      reason: '루틴 이름은 60자까지예요',
    })
  })

  it('rejected 가 pending 보다 우선한다', () => {
    const routines = [
      routine('a', { dirty: true }),
      routine('b', { name: '상체', dirty: true, syncError: '거절' }),
    ]
    const status = syncStatusFrom(routines, [log('w', { dirty: true })], 'u1')
    expect(status.state).toBe('rejected')
  })

  it('다른 주인의 dirty 와 syncError 는 무시한다', () => {
    const routines = [
      routine('a', { owner: 'u2', dirty: true, syncError: '거절' }),
      routine('b', { owner: null, dirty: true }),
      routine('c'),
    ]
    const workouts = [log('w', { owner: 'u2', dirty: true }), log('x', { owner: null, dirty: true })]
    expect(syncStatusFrom(routines, workouts, 'u1')).toEqual({ state: 'synced' })
  })

  it('같은 상태면 같은 참조를 돌려준다 — useSyncExternalStore 가 참조로 비교한다', () => {
    expect(syncStatusFrom([], [], 'u1')).toBe(syncStatusFrom([routine('a')], [], 'u1'))
    expect(syncStatusFrom([], [], null)).toBe(syncStatusFrom([], [], null))
  })
})

describe('syncStatusFrom — 묘비', () => {
  it('거절된 묘비는 rejected 이름에도 pending 에도 넣지 않는다 — 화면에 없는 루틴이다', () => {
    const tomb = routine('t', { name: '지운 루틴', deletedAt: 5, dirty: true, syncError: '거절' })
    expect(syncStatusFrom([tomb, routine('a')], [], 'u1')).toEqual({ state: 'synced' })
  })

  it('살아 있는 루틴의 거절만 이름으로 부른다', () => {
    const tomb = routine('t', { name: '지운 루틴', deletedAt: 5, dirty: true, syncError: '거절' })
    const live = routine('a', { name: '하체', dirty: true, syncError: '너무 길어요' })
    expect(syncStatusFrom([tomb, live], [], 'u1')).toEqual({
      state: 'rejected',
      names: ['하체'],
      reason: '너무 길어요',
    })
  })

  it('아직 못 올린 묘비는 pending 이다', () => {
    const tomb = routine('t', { deletedAt: 5, dirty: true })
    expect(syncStatusFrom([tomb], [], 'u1')).toEqual({ state: 'pending' })
  })
})

describe('needsSignOutConfirm', () => {
  it('못 올린 변경이 있으면 확인한다', () => {
    expect(needsSignOutConfirm([routine('a', { dirty: true })], [], 'u1')).toBe(true)
    expect(needsSignOutConfirm([], [log('w', { dirty: true })], 'u1')).toBe(true)
  })

  it('거절된 루틴이 있으면 확인한다', () => {
    expect(
      needsSignOutConfirm([routine('a', { dirty: true, syncError: '거절' })], [], 'u1'),
    ).toBe(true)
  })

  it('모두 올라갔으면 바로 로그아웃한다', () => {
    expect(needsSignOutConfirm([routine('a')], [log('w')], 'u1')).toBe(false)
  })

  it('다른 주인·손님의 못 올린 변경은 보지 않는다', () => {
    const others = [routine('g', { owner: null, dirty: true }), routine('o', { owner: 'u2', dirty: true })]
    expect(needsSignOutConfirm(others, [], 'u1')).toBe(false)
    expect(needsSignOutConfirm(others, [], null)).toBe(false)
  })
})
