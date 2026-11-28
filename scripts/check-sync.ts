import { randomUUID } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * 루틴 동기화·운동 기록 표가 실제로 서 있는지 브라우저를 열기 전에 확인한다.
 *
 * auth:check 와 같은 이유다 — routineSync 단위 테스트는 가짜 클라이언트로 돌아서 PostgREST 가
 * 표를 알고 있는지, RLS 가 닫혀 있는지 알 수 없다. 여기서 잡히는 것들:
 * 마이그레이션 0004 미실행, RLS 를 켜지 않음, insert 정책이 너무 넓음.
 *
 * 로그인하지 않은 anon 으로만 본다. 그래서 쓰기는 "거부되는지" 만 확인하고, 실제로 행이
 * 생기는 일은 없다. 로그인 상태의 왕복(올리기 → 다른 기기에서 받기)은 README 의 수동 확인이다.
 */

function fail(message: string, hint?: string): never {
  console.error(`실패: ${message}`)
  if (hint) console.error(`  ${hint}`)
  process.exit(1)
}

/** 구버전 PostgREST 는 42P01, 최근 버전은 스키마 캐시에서 못 찾았다는 PGRST205 를 준다. */
function isMissingTable(code: string | undefined): boolean {
  return code === '42P01' || code === 'PGRST205'
}

function missingTable(table: string): never {
  fail(
    `${table} 표가 없습니다.`,
    'supabase/migrations/0004_routines_and_workouts.sql 을 SQL Editor 에서 실행하세요.',
  )
}

/** anon 으로 읽으면 오류 없이 0행이어야 한다. 행이 보이면 남의 기록이 보인다는 뜻이다. */
async function checkRead(anon: SupabaseClient, table: string): Promise<void> {
  const { data, error } = await anon.from(table).select('id').limit(1)
  if (error) {
    if (isMissingTable(error.code)) missingTable(table)
    if (error.message.toLowerCase().includes('api key')) {
      fail(
        'anon 키가 거부당했습니다.',
        'Supabase 대시보드 → Project Settings → API 의 anon public 키인지 확인하세요.',
      )
    }
    fail(`${table} 조회가 실패했습니다: ${error.message} (code: ${error.code ?? '없음'})`)
  }
  if (data && data.length > 0) {
    fail(
      `로그인하지 않았는데 ${table} 행이 보입니다. RLS 가 열려 있습니다.`,
      `0004 마이그레이션의 'alter table public.${table} enable row level security' 와 정책을 확인하세요.`,
    )
  }
}

/**
 * anon 의 insert 는 RLS(또는 권한)로 42501 이 나와야 한다.
 *
 * 다른 오류도 "거부" 이긴 하지만 그냥 넘기지 않는다. 예컨대 23503(외래 키)이 나왔다면 RLS 를
 * 통과해 외래 키에서야 막혔다는 뜻이다 — 여기서 쓰는 user_id 가 아무도 아니라서 막혔을 뿐,
 * 진짜 사용자 id 를 넣으면 남의 이름으로 행을 쓸 수 있다.
 */
async function checkInsertRejected(
  anon: SupabaseClient,
  table: string,
  row: Record<string, unknown>,
): Promise<void> {
  const { error } = await anon.from(table).insert(row)
  if (!error) {
    fail(
      `로그인하지 않았는데 ${table} 에 쓰기가 됐습니다. insert 정책이 열려 있습니다.`,
      "0004 의 insert 정책이 'with check (user_id = auth.uid())' 인지 확인하세요.",
    )
  }
  if (isMissingTable(error.code)) missingTable(table)
  if (error.code !== '42501') {
    fail(
      `${table} 쓰기가 RLS 가 아닌 이유로 막혔습니다: ${error.message} (code: ${error.code ?? '없음'})`,
      'RLS 가 꺼져 있거나 insert 정책이 너무 넓을 수 있습니다. 0004 의 RLS 절을 확인하세요.',
    )
  }
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    console.log('NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 가 없습니다.')
    console.log('로그인 없이도 루틴과 운동 기록은 이 브라우저 안에서 그대로 동작합니다.')
    return
  }

  try {
    new URL(url)
  } catch {
    fail(`NEXT_PUBLIC_SUPABASE_URL 이 URL 형식이 아닙니다: ${url}`)
  }

  // anon 키로, 세션 없이. 브라우저에서 로그인하지 않은 사람과 같은 권한이다.
  const anon = createClient(url, anonKey, { auth: { persistSession: false } })

  // 아무 사용자도 아닌 id. 혹시 RLS 가 열려 있어도 외래 키에서 막혀 행이 남지 않는다.
  const nobody = randomUUID()
  const now = new Date().toISOString()

  await checkRead(anon, 'routines')
  await checkInsertRejected(anon, 'routines', {
    user_id: nobody,
    id: 'sync-check',
    name: '점검',
    items: [],
    position: 0,
    created_at: now,
    updated_at: now,
  })

  await checkRead(anon, 'workout_logs')
  await checkInsertRejected(anon, 'workout_logs', {
    user_id: nobody,
    id: 'sync-check',
    routine_id: 'sync-check',
    routine_name: '점검',
    completed_at: now,
    local_date: now.slice(0, 10),
  })

  console.log('성공: routines 와 workout_logs 표가 있고, 로그인하지 않으면 읽어도 0행, 쓰기는 거부됩니다.')
  console.log('')
  console.log('로그인 상태의 왕복(한 기기에서 올리고 다른 기기에서 받기)은 여기서 확인할 수 없습니다.')
  console.log('README 의 루틴 동기화 수동 확인 절을 따르세요.')
}

void main()
