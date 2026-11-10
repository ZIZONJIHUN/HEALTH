import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { StoredRoutine } from '@/features/routines/routines'
import { classifyPushError, fetchRoutines, pushRoutine } from '@/features/routines/routineSync'

/** from().select().eq().order() 와 from().upsert() 체인만 흉내 낸다. */
function fakeClient(opts: {
  rows?: unknown[]
  selectError?: { code?: string; message: string } | null
  upsertError?: { code?: string; message: string } | null
  upsertThrows?: Error
}) {
  const order = vi.fn(async () => ({ data: opts.rows ?? [], error: opts.selectError ?? null }))
  const eq = vi.fn(() => ({ order }))
  const select = vi.fn(() => ({ eq }))
  const upsert = vi.fn(async () => {
    if (opts.upsertThrows) throw opts.upsertThrows
    return { data: null, error: opts.upsertError ?? null }
  })
  const from = vi.fn(() => ({ select, upsert }))
  return { client: { from } as unknown as SupabaseClient, from, select, eq, order, upsert }
}

function make(over: Partial<StoredRoutine> = {}): StoredRoutine {
  return {
    id: 'r1',
    name: '하체',
    createdAt: Date.parse('2026-11-01T00:00:00.000Z'),
    items: [],
    updatedAt: Date.parse('2026-11-02T00:00:00.000Z'),
    deletedAt: null,
    owner: 'u1',
    dirty: true,
    syncError: '이전 오류',
    ...over,
  }
}

describe('fetchRoutines', () => {
  it('행을 StoredRoutine 으로 바꾼다', async () => {
    const item = { id: 'v1', title: '스쿼트', restSeconds: 60 }
    const { client, from, eq, order } = fakeClient({
      rows: [
        {
          id: 'r1',
          name: '하체',
          items: [item],
          position: 0,
          created_at: '2026-11-01T00:00:00+00:00',
          updated_at: '2026-11-02T00:00:00.000Z',
          deleted_at: null,
        },
        {
          id: 'r2',
          name: '지운 것',
          items: null,
          position: 1,
          created_at: '2026-11-01T00:00:00Z',
          updated_at: '2026-11-03T00:00:00Z',
          deleted_at: '2026-11-03T00:00:00Z',
        },
      ],
    })

    const routines = await fetchRoutines(client, 'u1')

    expect(from).toHaveBeenCalledWith('routines')
    expect(eq).toHaveBeenCalledWith('user_id', 'u1')
    expect(order).toHaveBeenCalledWith('position', { ascending: true })
    expect(routines).toEqual([
      {
        id: 'r1',
        name: '하체',
        createdAt: Date.parse('2026-11-01T00:00:00Z'),
        items: [item],
        updatedAt: Date.parse('2026-11-02T00:00:00Z'),
        deletedAt: null,
        owner: 'u1',
        dirty: false,
        syncError: null,
      },
      {
        id: 'r2',
        name: '지운 것',
        createdAt: Date.parse('2026-11-01T00:00:00Z'),
        items: [],
        updatedAt: Date.parse('2026-11-03T00:00:00Z'),
        deletedAt: Date.parse('2026-11-03T00:00:00Z'),
        owner: 'u1',
        dirty: false,
        syncError: null,
      },
    ])
  })

  it('조회 오류는 던진다', async () => {
    const { client } = fakeClient({ selectError: { code: '42P01', message: 'missing' } })
    await expect(fetchRoutines(client, 'u1')).rejects.toThrow('missing')
  })
})

describe('pushRoutine', () => {
  it('upsert 에 user_id 와 position 을 싣는다', async () => {
    const { client, from, upsert } = fakeClient({})
    const routine = make({ deletedAt: Date.parse('2026-11-04T00:00:00Z') })

    const result = await pushRoutine(client, 'u1', routine, 3)

    expect(result).toEqual({ ok: true })
    expect(from).toHaveBeenCalledWith('routines')
    expect(upsert).toHaveBeenCalledWith(
      {
        user_id: 'u1',
        id: 'r1',
        name: '하체',
        items: [],
        position: 3,
        created_at: '2026-11-01T00:00:00.000Z',
        updated_at: '2026-11-02T00:00:00.000Z',
        deleted_at: '2026-11-04T00:00:00.000Z',
      },
      { onConflict: 'user_id,id' },
    )
  })

  it('살아 있는 루틴은 deleted_at 을 null 로 보낸다', async () => {
    const { client, upsert } = fakeClient({})
    await pushRoutine(client, 'u1', make(), 0)
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ deleted_at: null }),
      expect.anything(),
    )
  })

  it('서버 거부는 rejected 로 돌려준다', async () => {
    const { client } = fakeClient({
      upsertError: { code: 'P0001', message: '루틴은 200개까지 저장할 수 있어요' },
    })
    expect(await pushRoutine(client, 'u1', make(), 0)).toMatchObject({
      ok: false,
      kind: 'rejected',
    })
  })

  it('네트워크 예외는 transient 다', async () => {
    const { client } = fakeClient({ upsertThrows: new TypeError('Failed to fetch') })
    expect(await pushRoutine(client, 'u1', make(), 0)).toEqual({ ok: false, kind: 'transient' })
  })
})

describe('classifyPushError', () => {
  it('오류가 없으면 ok', () => {
    expect(classifyPushError(null)).toEqual({ ok: true })
  })

  it('제약 위반은 rejected, 그 외는 transient', () => {
    expect(classifyPushError({ code: '23514', message: '' })).toMatchObject({ kind: 'rejected' })
    expect(
      classifyPushError({ code: 'P0001', message: '루틴은 200개까지 저장할 수 있어요' }),
    ).toMatchObject({ kind: 'rejected' })
    expect(classifyPushError({ code: 'PGRST301', message: 'JWT expired' })).toMatchObject({
      kind: 'transient',
    })
    expect(classifyPushError({ message: 'Failed to fetch' })).toMatchObject({ kind: 'transient' })
  })

  it('거부 이유는 사람이 읽는 한국어다', () => {
    expect(
      classifyPushError({ code: 'P0001', message: '루틴은 200개까지 저장할 수 있어요' }),
    ).toEqual({ ok: false, kind: 'rejected', reason: '루틴은 200개까지 저장할 수 있어요' })
    expect(
      classifyPushError({
        code: '23514',
        message: 'new row for relation "routines" violates check constraint "routines_items_check"',
      }),
    ).toEqual({ ok: false, kind: 'rejected', reason: '루틴 하나에 운동은 100개까지 담을 수 있어요' })
    expect(
      classifyPushError({
        code: '23514',
        message: 'new row for relation "routines" violates check constraint "routines_name_check"',
      }),
    ).toEqual({ ok: false, kind: 'rejected', reason: '루틴 이름은 60자까지 쓸 수 있어요' })
    // id 길이처럼 사용자가 고칠 수 없는 제약을 이름 탓으로 돌리지 않는다.
    expect(
      classifyPushError({
        code: '23514',
        message: 'new row for relation "routines" violates check constraint "routines_id_check"',
      }),
    ).toMatchObject({ kind: 'rejected', reason: expect.not.stringContaining('이름') })
    expect(classifyPushError({ code: '22001', message: 'value too long' })).toEqual({
      ok: false,
      kind: 'rejected',
      reason: '루틴 이름은 60자까지 쓸 수 있어요',
    })
  })
})
