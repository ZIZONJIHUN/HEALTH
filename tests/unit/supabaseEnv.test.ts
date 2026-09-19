import { beforeEach, describe, expect, it } from 'vitest'
import { supabasePublicConfig } from '@/lib/supabase/env'

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
})

describe('supabasePublicConfig', () => {
  it('둘 다 있으면 값을 돌려준다', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://p.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'

    expect(supabasePublicConfig()).toEqual({
      url: 'https://p.supabase.co',
      anonKey: 'anon-key',
    })
  })

  it('하나라도 없으면 null 이다', () => {
    expect(supabasePublicConfig()).toBeNull()

    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://p.supabase.co'
    expect(supabasePublicConfig()).toBeNull()
  })

  it('빈 문자열은 없는 것으로 본다', () => {
    // playwright.config.ts 가 E2E 에서 빈 문자열로 강제한다.
    // 빈 문자열을 값으로 취급하면 E2E 가 실제 Supabase 를 향해 요청한다.
    process.env.NEXT_PUBLIC_SUPABASE_URL = ''
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ''

    expect(supabasePublicConfig()).toBeNull()
  })
})
