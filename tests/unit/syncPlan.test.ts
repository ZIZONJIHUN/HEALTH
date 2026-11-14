import { describe, expect, it } from 'vitest'
import type { StoredRoutine } from '@/features/routines/routines'
import type { WorkoutLog } from '@/features/workouts/workouts'
import {
  applyRoutinePush,
  applyWorkoutPush,
  guestPrompt,
  hasPendingPush,
  retryDelay,
  routinesToPush,
  shouldPullOnFocus,
  userFromGetUser,
  workoutsToPush,
} from '@/features/routines/syncPlan'

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

describe('routinesToPush', () => {
  it('내 dirty 만, 내 루틴 사이의 순서(묘비 포함)를 position 으로 준다', () => {
    const stored = [
      routine('g', { owner: null, dirty: true }),
      routine('a'),
      routine('x', { owner: 'u2', dirty: true }),
      routine('t', { deletedAt: 5, dirty: true }),
      routine('b', { dirty: true }),
    ]
    expect(routinesToPush(stored, 'u1').map(({ routine: r, position }) => [r.id, position])).toEqual(
      [
        ['t', 1],
        ['b', 2],
      ],
    )
  })

  it('syncError 가 있는 루틴은 밀지 않는다 — 다시 보내도 같은 거절이다', () => {
    const stored = [routine('a', { dirty: true, syncError: '거절' }), routine('b', { dirty: true })]
    expect(routinesToPush(stored, 'u1').map(({ routine: r }) => r.id)).toEqual(['b'])
  })
})

describe('workoutsToPush', () => {
  it('내 dirty 기록만', () => {
    const stored = [
      log('a', { dirty: true }),
      log('b'),
      log('c', { owner: null, dirty: true }),
      log('d', { owner: 'u2', dirty: true }),
    ]
    expect(workoutsToPush(stored, 'u1').map((l) => l.id)).toEqual(['a'])
  })
})

describe('hasPendingPush', () => {
  it('밀 것이 있을 때만 true', () => {
    expect(hasPendingPush([routine('a')], [log('w')], 'u1')).toBe(false)
    expect(hasPendingPush([routine('a', { dirty: true })], [], 'u1')).toBe(true)
    expect(hasPendingPush([], [log('w', { dirty: true })], 'u1')).toBe(true)
    expect(hasPendingPush([routine('a', { dirty: true, syncError: 'x' })], [], 'u1')).toBe(false)
    expect(hasPendingPush([routine('a', { owner: 'u2', dirty: true })], [], 'u1')).toBe(false)
  })
})

describe('applyRoutinePush', () => {
  const pushed = routine('a', { dirty: true, updatedAt: 20 })

  it('ok 면 dirty 를 끈다', () => {
    const [after] = applyRoutinePush([pushed], pushed, { ok: true })
    expect(after.dirty).toBe(false)
    expect(after.syncError).toBeNull()
  })

  it('rejected 면 이유를 남기고 dirty 는 유지한다', () => {
    const [after] = applyRoutinePush([pushed], pushed, {
      ok: false,
      kind: 'rejected',
      reason: '루틴 이름은 60자까지예요',
    })
    expect(after.dirty).toBe(true)
    expect(after.syncError).toBe('루틴 이름은 60자까지예요')
  })

  it('transient 면 바꾸지 않는다(같은 참조)', () => {
    const stored = [pushed]
    expect(applyRoutinePush(stored, pushed, { ok: false, kind: 'transient' })).toBe(stored)
  })

  it('미는 동안 사용자가 다시 고쳤으면 결과를 반영하지 않는다 — 새 변경을 잃지 않게', () => {
    const edited = { ...pushed, name: '새 이름', updatedAt: 30 }
    const stored = [edited]
    expect(applyRoutinePush(stored, pushed, { ok: true })).toBe(stored)
    expect(
      applyRoutinePush(stored, pushed, { ok: false, kind: 'rejected', reason: 'x' }),
    ).toBe(stored)
  })

  it('미는 동안 지워졌으면(묘비) 결과를 반영하지 않는다', () => {
    const stored = [{ ...pushed, deletedAt: 25, updatedAt: 25 }]
    expect(applyRoutinePush(stored, pushed, { ok: true })).toBe(stored)
  })

  it('미는 동안 주인이 바뀌었거나 사라졌으면 그대로', () => {
    const moved = [{ ...pushed, owner: 'u2' }]
    expect(applyRoutinePush(moved, pushed, { ok: true })).toBe(moved)
    const gone: StoredRoutine[] = []
    expect(applyRoutinePush(gone, pushed, { ok: true })).toBe(gone)
  })

  it('다른 루틴은 건드리지 않는다', () => {
    const other = routine('b', { dirty: true })
    const after = applyRoutinePush([other, pushed], pushed, { ok: true })
    expect(after[0]).toBe(other)
  })
})

describe('applyWorkoutPush', () => {
  const pushed = log('w', { dirty: true })

  it('ok 면 dirty 를 끈다', () => {
    expect(applyWorkoutPush([pushed], pushed, { ok: true })[0].dirty).toBe(false)
  })

  it('rejected 면 기록을 지운다 — 하루 상한에 걸린 기록은 기록하지 않은 것으로 친다', () => {
    const other = log('x')
    expect(
      applyWorkoutPush([other, pushed], pushed, { ok: false, kind: 'rejected', reason: 'x' }),
    ).toEqual([other])
  })

  it('transient 면 바꾸지 않는다(같은 참조)', () => {
    const stored = [pushed]
    expect(applyWorkoutPush(stored, pushed, { ok: false, kind: 'transient' })).toBe(stored)
  })

  it('미는 동안 주인이 바뀌었으면 그대로', () => {
    const moved = [{ ...pushed, owner: 'u2' }]
    expect(applyWorkoutPush(moved, pushed, { ok: true })).toBe(moved)
    expect(
      applyWorkoutPush(moved, pushed, { ok: false, kind: 'rejected', reason: 'x' }),
    ).toBe(moved)
  })
})

describe('retryDelay', () => {
  it('5초, 15초, 60초, 이후 60초', () => {
    expect([0, 1, 2, 3, 10].map(retryDelay)).toEqual([5_000, 15_000, 60_000, 60_000, 60_000])
  })
})

describe('shouldPullOnFocus', () => {
  it('당긴 적이 없거나 30초가 지났을 때만', () => {
    expect(shouldPullOnFocus(null, 1_000)).toBe(true)
    expect(shouldPullOnFocus(1_000, 30_999)).toBe(false)
    expect(shouldPullOnFocus(1_000, 31_000)).toBe(true)
  })
})

describe('guestPrompt', () => {
  it('살아 있는 손님 루틴이 있으면 루틴 개수로 묻는다', () => {
    const routines = [
      routine('a', { owner: null }),
      routine('b', { owner: null }),
      routine('t', { owner: null, deletedAt: 3 }),
      routine('m'),
    ]
    expect(guestPrompt(routines, [log('w', { owner: null })])).toBe(
      '로그인 전에 이 브라우저에서 만든 루틴 2개가 있어요. 내 계정으로 가져올까요?',
    )
  })

  it('손님 기록만 있으면 기록 개수로 묻는다', () => {
    expect(guestPrompt([routine('t', { owner: null, deletedAt: 3 })], [log('w', { owner: null })])).toBe(
      '로그인 전에 이 브라우저에서 만든 운동 기록 1개가 있어요. 내 계정으로 가져올까요?',
    )
  })

  it('손님 것이 없으면 null', () => {
    expect(guestPrompt([routine('a')], [log('w'), log('x', { owner: 'u2' })])).toBeNull()
  })
})

describe('applyRoutinePush — 묘비', () => {
  it('거절된 묘비는 저장소에서 버린다', () => {
    const tomb = routine('t', { deletedAt: 5, dirty: true })
    const live = routine('a')
    const next = applyRoutinePush([tomb, live], tomb, {
      ok: false,
      kind: 'rejected',
      reason: '거절',
    })
    expect(next).toEqual([live])
  })

  it('받아들여진 묘비는 dirty 만 끈다', () => {
    const tomb = routine('t', { deletedAt: 5, dirty: true })
    const [next] = applyRoutinePush([tomb], tomb, { ok: true })
    expect(next).toMatchObject({ id: 't', deletedAt: 5, dirty: false, syncError: null })
  })

  it('일시 실패한 묘비는 그대로 둔다', () => {
    const stored = [routine('t', { deletedAt: 5, dirty: true })]
    expect(applyRoutinePush(stored, stored[0], { ok: false, kind: 'transient' })).toBe(stored)
  })
})

describe('userFromGetUser', () => {
  it('오류가 없으면 사용자(또는 null)를 그대로 쓴다', () => {
    expect(userFromGetUser('u1', null)).toBe('u1')
    expect(userFromGetUser(null, null)).toBeNull()
  })

  it('세션 없음은 로그아웃이다', () => {
    expect(userFromGetUser(null, { name: 'AuthSessionMissingError', status: 400 })).toBeNull()
  })

  it('토큰 거절(401·403)은 로그아웃이다', () => {
    expect(userFromGetUser(null, { name: 'AuthApiError', status: 401 })).toBeNull()
    expect(userFromGetUser(null, { name: 'AuthApiError', status: 403 })).toBeNull()
  })

  it('그 밖의 오류는 모름이다 — 오프라인, 서버 오류, 모르는 오류', () => {
    expect(userFromGetUser(null, { name: 'AuthRetryableFetchError', status: 0 })).toBe('unknown')
    expect(userFromGetUser(null, { name: 'AuthApiError', status: 500 })).toBe('unknown')
    expect(userFromGetUser(null, { name: 'AuthUnknownError' })).toBe('unknown')
    expect(userFromGetUser(null, { name: 'AuthApiError', status: 400 })).toBe('unknown')
  })
})
