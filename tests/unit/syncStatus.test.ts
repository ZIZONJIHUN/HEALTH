import { describe, expect, it } from 'vitest'
import type { StoredRoutine } from '@/features/routines/routines'
import type { WorkoutLog } from '@/features/workouts/workouts'
import { syncStatusFrom } from '@/features/routines/syncStatus'

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
