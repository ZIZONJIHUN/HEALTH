import { createClient } from '@supabase/supabase-js'

/**
 * 로그인 설정이 실제로 서 있는지 브라우저를 열기 전에 확인한다.
 *
 * cache:check 가 service_role 과 search_cache 를 보는 것과 같은 이유다 — 목 테스트로는
 * PostgREST 가 요청을 받아들이는지 알 수 없다. 여기서 잡히는 것들:
 * 마이그레이션 0003 미실행, anon 키 오타, URL 오타, RLS 설정 실수.
 *
 * 실제 구글 OAuth 왕복은 여기서 확인할 수 없다. 그건 README "로그인" 절의 수동 확인이다.
 */

function fail(message: string, hint?: string): never {
  console.error(`실패: ${message}`)
  if (hint) console.error(`  ${hint}`)
  process.exit(1)
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    console.log('NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 가 없습니다.')
    console.log('로그인 없이도 앱은 동작합니다. 로그인 버튼이 비활성으로 보일 뿐입니다.')
    return
  }

  try {
    new URL(url)
  } catch {
    fail(`NEXT_PUBLIC_SUPABASE_URL 이 URL 형식이 아닙니다: ${url}`)
  }

  // anon 키로 접근한다. 브라우저가 쓰는 것과 같은 권한이다.
  const anon = createClient(url, anonKey, { auth: { persistSession: false } })

  const { data, error } = await anon.from('profiles').select('role').limit(1)

  if (error) {
    if (error.code === '42P01') {
      fail(
        'profiles 테이블이 없습니다.',
        'supabase/migrations/0003_profiles.sql 을 SQL Editor 에서 실행하세요.',
      )
    }
    if (error.message.toLowerCase().includes('api key')) {
      fail(
        'anon 키가 거부당했습니다.',
        'Supabase 대시보드 → Project Settings → API 의 anon public 키인지 확인하세요.',
      )
    }
    fail(`profiles 조회가 실패했습니다: ${error.message} (code: ${error.code ?? '없음'})`)
  }

  /*
    RLS 가 켜져 있고 정책이 "본인 것만" 이므로, 로그인하지 않은 anon 은 행을 볼 수
    없어야 한다. 행이 나온다면 RLS 가 꺼져 있거나 정책이 너무 넓다 — 남의 프로필이
    보인다는 뜻이라 그냥 넘길 수 없다.
  */
  if (data && data.length > 0) {
    fail(
      '로그인하지 않았는데 profiles 행이 보입니다. RLS 가 열려 있습니다.',
      "0003 마이그레이션의 'alter table public.profiles enable row level security' 와 정책을 확인하세요.",
    )
  }

  console.log('성공: anon 키로 Supabase 에 닿고, profiles 테이블이 있고, RLS 가 닫혀 있습니다.')
  console.log('')
  console.log('실제 구글 로그인 왕복은 여기서 확인할 수 없습니다.')
  console.log('npm run dev 로 띄우고 http://localhost:3000/account 에서')
  console.log('README "로그인" 절의 수동 확인 8단계를 따르세요.')
}

void main()
