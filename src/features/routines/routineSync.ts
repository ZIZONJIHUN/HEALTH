import type { SupabaseClient } from '@supabase/supabase-js'
import { LIMITS, type RoutineItem, type StoredRoutine } from './routines'

/**
 * 루틴의 서버 입출력. 표(0004 마이그레이션)와 StoredRoutine 사이를 옮겨 적기만 한다.
 *
 * 무엇을 언제 올릴지(병합·재시도)는 여기서 정하지 않는다 — 그건 동기화 컨트롤러의 몫이고,
 * 이 파일은 "한 번 읽기 / 한 번 쓰기" 와 그 결과를 분류하는 일만 한다. 그래야 컨트롤러
 * 테스트가 네트워크 없이 이 함수들만 갈아 끼워 돌 수 있다.
 *
 * 클라이언트는 받아서 쓴다. 여기서 만들면 테스트가 가짜를 넣을 수 없고, 실수로 service
 * 클라이언트(RLS 우회)를 쓰는 길이 생긴다. 브라우저의 anon 클라이언트만 넘어와야 한다.
 */

export type PushResult =
  | { ok: true }
  | { ok: false; kind: 'transient' }
  | { ok: false; kind: 'rejected'; reason: string }

type RoutineRow = {
  id: string
  name: string
  items: unknown
  position: number
  created_at: string
  updated_at: string
  deleted_at: string | null
}

const ROUTINE_COLUMNS = 'id,name,items,position,created_at,updated_at,deleted_at'

const REASON = {
  routines: `루틴은 ${LIMITS.routines}개까지 저장할 수 있어요`,
  items: `루틴 하나에 운동은 ${LIMITS.items}개까지 담을 수 있어요`,
  name: `루틴 이름은 ${LIMITS.nameLength}자까지 쓸 수 있어요`,
  other: '서버가 이 루틴의 내용을 받아들이지 않았어요',
} as const

/** timestamptz 는 ISO 문자열로 온다. 못 읽으면 0 — 병합에서 가장 오래된 쪽으로 진다. */
function toMs(value: string): number {
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? 0 : ms
}

function toIso(ms: number): string {
  return new Date(ms).toISOString()
}

function toStored(row: RoutineRow, userId: string): StoredRoutine {
  return {
    id: row.id,
    name: row.name,
    createdAt: toMs(row.created_at),
    // 표의 check 가 배열임을 보장하지만, 손으로 고친 행 하나 때문에 화면이 죽지 않게 한 번 더 본다.
    items: Array.isArray(row.items) ? (row.items as RoutineItem[]) : [],
    updatedAt: toMs(row.updated_at),
    deletedAt: row.deleted_at === null ? null : toMs(row.deleted_at),
    owner: userId,
    // 서버에서 막 읽은 것이므로 올릴 변경도, 남은 오류도 없다.
    dirty: false,
    syncError: null,
  }
}

/**
 * 이 사용자의 루틴을 전부 읽는다. **묘비(deleted_at 있는 행)도 함께 돌려준다** — 다른 기기에서
 * 지운 루틴을 이 기기가 되살리지 않으려면 병합이 묘비를 봐야 한다.
 *
 * RLS 가 본인 행만 보여 주지만 user_id 조건을 직접 건다. 정책이 실수로 넓어져도 남의 루틴이
 * 이 브라우저의 저장소로 섞여 들어오지 않게 하는 두 번째 울타리다.
 */
export async function fetchRoutines(
  client: SupabaseClient,
  userId: string,
): Promise<StoredRoutine[]> {
  const { data, error } = await client
    .from('routines')
    .select(ROUTINE_COLUMNS)
    .eq('user_id', userId)
    .order('position', { ascending: true })
  if (error) throw new Error(error.message)
  return ((data ?? []) as RoutineRow[]).map((row) => toStored(row, userId))
}

/**
 * 루틴 하나를 올린다. 지우기도 deleted_at 을 채운 upsert 다 — delete 정책을 열지 않았으므로
 * 행을 실제로 지우는 일은 서버 트리거(30일 지난 묘비 정리)만 한다.
 *
 * 던지는 예외(오프라인, DNS 실패)는 다시 시도하면 될 일이라 transient 로 바꾼다. 호출하는 쪽이
 * try/catch 를 빠뜨려 동기화 루프가 멈추는 일을 막는다.
 */
export async function pushRoutine(
  client: SupabaseClient,
  userId: string,
  routine: StoredRoutine,
  position: number,
): Promise<PushResult> {
  try {
    const { error } = await client.from('routines').upsert(
      {
        user_id: userId,
        id: routine.id,
        name: routine.name,
        items: routine.items,
        position,
        created_at: toIso(routine.createdAt),
        updated_at: toIso(routine.updatedAt),
        deleted_at: routine.deletedAt === null ? null : toIso(routine.deletedAt),
      },
      { onConflict: 'user_id,id' },
    )
    return classifyPushError(error)
  } catch {
    return { ok: false, kind: 'transient' }
  }
}

/**
 * 서버 오류를 "다시 해도 같은 결과" 와 "나중에 다시" 로 나눈다.
 *
 * rejected 는 표의 제약이나 트리거가 거절한 것이라 몇 번을 다시 보내도 같다. 이걸 transient 로
 * 두면 매 동기화마다 같은 요청을 보내며 영원히 돈다. 반대로 모르는 오류(만료된 토큰, 5xx)를
 * rejected 로 두면 사용자가 고칠 수 없는 이유로 루틴이 영구히 "저장 실패" 에 묶인다. 그래서
 * 확실히 아는 코드만 rejected 로 보내고 나머지는 전부 transient 다.
 */
export function classifyPushError(error: { code?: string; message: string } | null): PushResult {
  if (error === null) return { ok: true }
  switch (error.code) {
    case 'P0001':
      // 트리거의 raise 문구는 이미 사람이 읽을 한국어다. 비어 있을 때만 대신 채운다.
      return { ok: false, kind: 'rejected', reason: error.message || REASON.routines }
    case '23514':
      // check 제약 이름(routines_items_check / routines_name_check)으로 어느 상한인지 가린다.
      // id 길이처럼 사용자가 볼 일 없는 제약은 뭉뚱그린다 — 이름 탓으로 돌리면 엉뚱한 걸 고치게 된다.
      if (error.message.includes('items')) return { ok: false, kind: 'rejected', reason: REASON.items }
      if (error.message.includes('name')) return { ok: false, kind: 'rejected', reason: REASON.name }
      return { ok: false, kind: 'rejected', reason: REASON.other }
    case '22001':
      return { ok: false, kind: 'rejected', reason: REASON.name }
    default:
      return { ok: false, kind: 'transient' }
  }
}
