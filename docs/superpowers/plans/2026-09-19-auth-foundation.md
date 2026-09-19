# 인증 기반 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 구글 OAuth 로그인·로그아웃과 `profiles.role` 을 붙인다. 익명 사용은 지금 그대로 전부 동작한다.

**Architecture:** Supabase Auth + `@supabase/ssr` 쿠키 세션. Supabase 클라이언트를 `service`(RLS 우회, 캐시·예산 전용) / `server`(RLS 적용, 서버 컴포넌트·라우트 핸들러) / `browser`(RLS 적용, 클라이언트 컴포넌트) 셋으로 나눈다. 세션 갱신은 `proxy.ts`. `/account` 라우트는 만들되 **탭바에는 넣지 않는다** — 루틴 동기화(단계 B)가 끝날 때 함께 노출한다.

**Tech Stack:** Next.js 16.3.5 (App Router, Turbopack), TypeScript, Supabase (`@supabase/supabase-js` + `@supabase/ssr@^0.12.7`), Tailwind v4, vitest, Playwright

**설계 문서:** `docs/superpowers/specs/2026-09-19-auth-foundation-design.md`

## Global Constraints

- 모든 사용자 노출 문구는 **한국어**. 코드 주석도 한국어 (기존 코드베이스 규칙).
- 검증 4종이 전부 통과해야 커밋한다: `npm run lint -- --max-warnings 0`, `npx tsc --noEmit`, `npm test`, `npm run test:e2e`.
- 린트는 **경고 0**이 기준이다 (`--max-warnings 0`). CI 가 같은 기준으로 돈다.
- 아이콘은 `@/components/ui/icons` 를 통해서만 가져온다. 굵기는 `ICON_WEIGHT`.
- 버튼·칩·카드·아이콘버튼은 `@/components/ui/` 프리미티브를 쓴다. 클래스 문자열을 복붙하지 않는다.
- 새 UI 요소의 색은 `globals.css` 토큰만 쓴다. 액센트는 라임 하나뿐.
- 기능 코드는 `src/features/<기능>/`, 도메인 무관 유틸만 `src/lib/`.
- `service_role` 키는 `search_cache` 와 `api_budget` 에만 닿는다. **사용자 데이터에 쓰지 않는다.**
- 이 계획은 `TABS` 배열(`src/components/nav/navigation.ts`)을 **수정하지 않는다.**

## 사전 준비 (사람이 먼저 해야 함)

코드로 대신할 수 없다. Task 6 의 수동 확인 전까지는 끝나 있어야 한다. Task 1~5 는 이것 없이도 진행·검증 가능하다.

1. Supabase 프로젝트 생성, 마이그레이션 `0001`·`0002` 실행
2. Google Cloud Console → OAuth 동의 화면 + 웹 애플리케이션 클라이언트 ID/시크릿 발급
3. Supabase 대시보드 → Authentication → Providers → Google 에 ID/시크릿 입력
4. Google 쪽 "승인된 리디렉션 URI" 에 Supabase 콜백(`https://<project>.supabase.co/auth/v1/callback`) 등록
5. Supabase → Authentication → URL Configuration → Site URL `http://localhost:3000`, Redirect URLs 에 `http://localhost:3000/**` 와 배포 도메인 추가

## 파일 구조

| 파일 | 책임 |
|---|---|
| `src/lib/supabase/service.ts` | **이동** (`src/lib/supabase.ts` → 여기). `service_role` 클라이언트 + `withTimeout` + `TIMED_OUT`. 캐시·예산 전용 |
| `src/lib/supabase/env.ts` | 환경변수 한 곳에서 읽기. `supabasePublicConfig()` 하나 |
| `src/lib/supabase/server.ts` | 서버용 `anon` 클라이언트 (쿠키 기반, RLS 적용) |
| `src/lib/supabase/browser.ts` | 브라우저용 `anon` 클라이언트 |
| `src/features/account/redirectTarget.ts` | `next` 파라미터 검증 (오픈 리다이렉트 방어). **순수 함수** |
| `src/features/account/session.ts` | 현재 사용자·역할 조회. 프로필 없으면 `'user'` |
| `src/features/account/AccountPanel.tsx` | "내 정보" 화면 본문 (클라이언트 컴포넌트) |
| `src/app/account/page.tsx` | `/account` 라우트 |
| `src/app/auth/callback/route.ts` | OAuth 콜백 라우트 핸들러 |
| `proxy.ts` (프로젝트 루트) | 세션 갱신 |
| `supabase/migrations/0003_profiles.sql` | `profiles` 테이블 + 트리거 + RLS |

---

### Task 1: 환경변수 이름 통일과 service 클라이언트 이동

URL 이 서버·브라우저 양쪽에 필요해졌다. `SUPABASE_URL` 과 `NEXT_PUBLIC_SUPABASE_URL` 을 따로 두면 언젠가 어긋난다. 먼저 이름을 통일하고 기존 파일을 옮긴다. **동작은 하나도 바뀌지 않는다.**

**Files:**
- Create: `src/lib/supabase/env.ts`
- Move: `src/lib/supabase.ts` → `src/lib/supabase/service.ts`
- Modify: `src/lib/searchCache.ts`, `src/lib/apiBudget.ts` (import 경로)
- Modify: `scripts/seed-cache.ts`, `scripts/check-cache.ts`, `playwright.config.ts`, `.env.local.example`, `README.md`
- Test: `tests/unit/supabaseEnv.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `supabasePublicConfig(): { url: string; anonKey: string } | null` — 둘 다 있을 때만 객체, 아니면 `null`
  - `getSupabaseClient(): SupabaseClient | null` (기존 이름 유지, `service.ts` 로 이동)
  - `withTimeout<T>(op, ms?)`, `TIMED_OUT`, `SUPABASE_TIMEOUT_MS` (기존 그대로)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/unit/supabaseEnv.test.ts`:

```ts
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
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/unit/supabaseEnv.test.ts`
Expected: FAIL — `Cannot find module '@/lib/supabase/env'`

- [ ] **Step 3: env.ts 를 만든다**

`src/lib/supabase/env.ts`:

```ts
/**
 * Supabase 공개 설정.
 *
 * URL 과 anon 키는 브라우저 번들에 들어가야 해서 NEXT_PUBLIC_ 접두사를 쓴다.
 * 공개돼도 안전하다 — anon 키로 할 수 있는 일은 RLS 가 정한 범위뿐이다.
 * (service_role 키는 다르다. 그건 RLS 를 우회하므로 절대 NEXT_PUBLIC_ 를 붙이지 않는다.)
 *
 * 한쪽만 있으면 null 을 돌려준다. 반쪽짜리 설정으로 클라이언트를 만들면
 * 실패 지점이 런타임 깊숙한 곳으로 밀려난다.
 */
export function supabasePublicConfig(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) return null
  return { url, anonKey }
}
```

- [ ] **Step 4: 테스트 통과를 확인한다**

Run: `npx vitest run tests/unit/supabaseEnv.test.ts`
Expected: PASS (3개)

- [ ] **Step 5: service.ts 로 옮기고 URL 이름을 바꾼다**

```bash
mkdir -p src/lib/supabase
git mv src/lib/supabase.ts src/lib/supabase/service.ts
```

`src/lib/supabase/service.ts` 의 `getSupabaseClient` 안에서 URL 을 읽는 줄을 바꾼다:

```ts
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
```

그리고 파일 상단 JSDoc 을 다음으로 교체한다:

```ts
/**
 * service_role 클라이언트. **RLS 를 통째로 우회한다.**
 *
 * 그래서 이 파일이 닿는 테이블은 `search_cache` 와 `api_budget` 둘뿐이다.
 * 둘 다 사용자와 무관한 서버 자체의 데이터다.
 *
 * **사용자 데이터에는 절대 쓰지 말 것.** 여기로 사용자 쿼리를 보내면 RLS 정책을
 * 아무리 잘 짜도 남의 데이터가 그대로 나온다. 사용자 데이터는
 * `./server.ts` 나 `./browser.ts` 를 쓴다.
 *
 * 캐시와 호출 예산은 성질이 같다 — **없어도 앱은 동작해야 하고, 느려도 앱을
 * 멈춰서는 안 된다.** 둘 다 최적화·방어 장치이지 정확성 의존성이 아니다.
 */
```

- [ ] **Step 6: import 경로와 나머지 참조를 고친다**

```bash
sed -i "s#from './supabase'#from './supabase/service'#" src/lib/searchCache.ts src/lib/apiBudget.ts
sed -i 's#SUPABASE_URL#NEXT_PUBLIC_SUPABASE_URL#g' scripts/seed-cache.ts scripts/check-cache.ts
```

`playwright.config.ts` 의 env 블록을 바꾼다 (기존 주석은 그대로 두고 키 이름만):

```ts
      env: {
        YOUTUBE_API_KEY: 'test-key',
        YOUTUBE_API_BASE: 'http://127.0.0.1:4010/youtube/v3',
        NEXT_PUBLIC_SUPABASE_URL: '',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
        SUPABASE_SERVICE_ROLE_KEY: '',
      },
```

`.env.local.example` 을 교체한다:

```
# YouTube Data API v3 키. 서버에서만 사용된다.
YOUTUBE_API_KEY=

# 테스트에서 모의 서버를 가리키기 위한 용도. 비워두면 공식 엔드포인트를 쓴다.
YOUTUBE_API_BASE=

# Supabase. 비워두면 검색 캐시와 로그인이 모두 꺼진 채로 동작한다.
# URL 과 anon 키는 브라우저에도 들어가므로 NEXT_PUBLIC_ 이다 (공개돼도 안전).
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# service_role 키는 RLS 를 우회한다. 절대 NEXT_PUBLIC_ 을 붙이지 않는다.
SUPABASE_SERVICE_ROLE_KEY=
```

`README.md` 에서 `SUPABASE_URL` 을 언급하는 모든 줄을 `NEXT_PUBLIC_SUPABASE_URL` 로 바꾸고, "배포" 절의 환경변수 목록에 `NEXT_PUBLIC_SUPABASE_ANON_KEY` 를 추가한다.

- [ ] **Step 7: `.env.local` 을 직접 고친다**

`.env.local` 은 git 에 없으므로 sed 대상이 아니다. 가진 파일의 `SUPABASE_URL=` 줄을 `NEXT_PUBLIC_SUPABASE_URL=` 로 바꾸고 `NEXT_PUBLIC_SUPABASE_ANON_KEY=` 줄을 추가한다. 값이 비어 있어도 된다.

- [ ] **Step 8: 검증 4종을 돌린다**

```bash
npx tsc --noEmit && npm run lint -- --max-warnings 0 && npm test && npm run test:e2e
```

Expected: tsc 0 에러, lint 0 경고, 단위 157개 통과(154 + 신규 3), E2E 13개 통과.

남은 참조가 없는지 확인한다:

```bash
grep -rn "from '@/lib/supabase'\|from './supabase'" src tests scripts
grep -rn "process.env.SUPABASE_URL" src tests scripts playwright.config.ts
# Step 6 의 sed 를 두 번 돌리면 접두사가 겹친다. 겹쳤는지 확인한다.
grep -rn "NEXT_PUBLIC_NEXT_PUBLIC" src tests scripts playwright.config.ts .env.local.example
```

Expected: 셋 다 결과 없음.

- [ ] **Step 9: 커밋**

```bash
git add -A
git commit -m "refactor: Supabase URL 을 NEXT_PUBLIC_ 으로 통일하고 service 클라이언트를 분리한다

로그인이 붙으면 브라우저도 같은 URL 이 필요하다. 서버용과 브라우저용을 따로 두면
언젠가 어긋나므로 하나로 합친다.

service_role 키는 RLS 를 우회한다. 사용자 데이터 코드가 실수로 이 클라이언트를
잡으면 RLS 가 무의미해지므로, 파일을 supabase/service.ts 로 옮겨 이름으로
구분되게 하고 닿는 테이블이 search_cache·api_budget 뿐임을 문서화한다.

동작 변경 없음."
```

---

### Task 2: profiles 테이블과 트리거

**Files:**
- Create: `supabase/migrations/0003_profiles.sql`
- Modify: `README.md` (마이그레이션 표)

**Interfaces:**
- Consumes: 없음
- Produces: `public.profiles(id uuid, role text, created_at timestamptz)` — Task 4 의 `session.ts` 가 읽는다

- [ ] **Step 1: 마이그레이션을 쓴다**

`supabase/migrations/0003_profiles.sql`:

```sql
-- ---------------------------------------------------------------------------
-- 사용자 프로필과 역할
--
-- auth.users 에 직접 열을 붙일 수 없어서 1:1 테이블을 따로 둔다.
-- 지금 필요한 것은 role 하나뿐이지만, 나중에 추가하면 이미 가입한 사람들 몫을
-- 백필해야 한다. 백필을 빠뜨리면 "관리자인데 관리자 화면이 안 보임" 으로 나타나
-- 원인 찾기가 번거롭다.
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id         uuid        primary key references auth.users(id) on delete cascade,
  role       text        not null default 'user' check (role in ('user','admin')),
  created_at timestamptz not null default now()
);

/*
  가입 시 자동 생성.

  앱 코드에서 만들면 언젠가 빠뜨린다. OAuth 콜백에서만 만들면 다른 경로로 가입한
  사용자가 프로필 없이 남고, 그 사용자는 role 조회가 null 이라 관리자 판정에서
  이상하게 동작한다.

  security definer 가 필요하다 — 트리거는 가입하는 사용자 권한으로 돌아서
  public.profiles 에 쓸 권한이 없다. 대신 search_path 를 비우고 모든 이름을
  스키마까지 적는다. 이 둘을 빠뜨리는 것이 Postgres 의 전형적인 권한 상승 경로다.
*/
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- RLS — 읽기는 본인만, 쓰기는 아무도 못 한다.
--
-- insert/update/delete 정책을 일부러 만들지 않는다. 정책이 없으면 anon 과
-- authenticated 는 아무것도 못 한다. 생성은 위 트리거(security definer)가,
-- 역할 변경은 service_role 이나 Supabase 콘솔이 한다.
--
-- 프로필에 본인이 고칠 필드가 지금 하나도 없다. 닉네임 같은 것이 생기면 그때
-- 그 열에 한정한 update 정책을 연다. 지금 여는 것은 쓸 데 없는 권한이다.
--
-- 관리자 승격 UI 는 만들지 않는다. 관리자가 한둘인 규모에서 승격 UI 는
-- 권한 상승 취약점 표면만 만든다:
--   update public.profiles set role = 'admin' where id = '<uuid>';
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;

drop policy if exists "본인 프로필 읽기" on public.profiles;
create policy "본인 프로필 읽기" on public.profiles
  for select using (auth.uid() = id);
```

- [ ] **Step 2: README 의 마이그레이션 표에 줄을 추가한다**

`| 0003_profiles.sql | 사용자 프로필과 역할(role) + 가입 트리거 + RLS |`

그 표 아래에 한 문단을 덧붙인다:

```markdown
`0003` 은 로그인을 쓸 때만 필요하다. 실행하지 않으면 로그인한 사용자의 프로필이
생성되지 않고, 앱은 그 사용자를 일반 사용자(`role: 'user'`)로 취급한다.
```

- [ ] **Step 3: 커밋**

```bash
git add supabase/migrations/0003_profiles.sql README.md
git commit -m "feat: profiles 테이블과 가입 트리거를 추가한다

role 하나뿐이지만 지금 만든다. 나중에 추가하면 기존 가입자를 백필해야 하고,
빠뜨리면 '관리자인데 관리자 화면이 안 보임' 으로 조용히 틀린다.

생성은 트리거가 맡는다. 앱 코드에서 만들면 언젠가 빠뜨리고, OAuth 콜백에서만
만들면 다른 경로로 가입한 사용자가 프로필 없이 남는다.

RLS 는 읽기만 본인에게 연다. insert/update/delete 정책을 만들지 않으므로
anon·authenticated 는 아무것도 못 한다 — 지금 프로필에 본인이 고칠 필드가 없다."
```

---

### Task 3: 리다이렉트 대상 검증 (오픈 리다이렉트 방어)

**이 태스크가 이 계획에서 가장 보안에 가깝다.** 순수 함수라 테스트로 완전히 덮을 수 있다.

**Files:**
- Create: `src/features/account/redirectTarget.ts`
- Test: `tests/unit/redirectTarget.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces: `safeRedirectTarget(raw: string | null | undefined): string` — 항상 앱 내부 경로를 돌려준다

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/unit/redirectTarget.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { safeRedirectTarget } from '@/features/account/redirectTarget'

/**
 * OAuth 콜백의 next 파라미터는 공격자가 URL 하나로 정할 수 있다.
 * 그대로 따르면 우리 도메인의 로그인 링크가 피싱 사이트로 사람을 보낸다.
 */
describe('safeRedirectTarget', () => {
  it('앱 내부 경로는 그대로 쓴다', () => {
    expect(safeRedirectTarget('/account')).toBe('/account')
    expect(safeRedirectTarget('/')).toBe('/')
    expect(safeRedirectTarget('/?q=스쿼트')).toBe('/?q=스쿼트')
    expect(safeRedirectTarget('/feed?q=런지&i=2')).toBe('/feed?q=런지&i=2')
  })

  it('절대 URL 을 거부한다', () => {
    expect(safeRedirectTarget('https://evil.test')).toBe('/account')
    expect(safeRedirectTarget('http://evil.test/path')).toBe('/account')
  })

  it('프로토콜 상대 URL 을 거부한다', () => {
    // //evil.test 는 브라우저가 https://evil.test 로 해석한다.
    // "/ 로 시작하는지"만 보는 검사를 통과해버리는 고전적인 구멍이다.
    expect(safeRedirectTarget('//evil.test')).toBe('/account')
    expect(safeRedirectTarget('//evil.test/path')).toBe('/account')
  })

  it('역슬래시 우회를 거부한다', () => {
    // 일부 브라우저가 \\ 를 // 로 정규화한다.
    expect(safeRedirectTarget('\\\\evil.test')).toBe('/account')
    expect(safeRedirectTarget('/\\evil.test')).toBe('/account')
  })

  it('스킴을 가진 값을 거부한다', () => {
    expect(safeRedirectTarget('javascript:alert(1)')).toBe('/account')
    expect(safeRedirectTarget('data:text/html,<script>')).toBe('/account')
    expect(safeRedirectTarget('mailto:a@b.c')).toBe('/account')
  })

  it('경로가 아닌 값을 거부한다', () => {
    expect(safeRedirectTarget('account')).toBe('/account')
    expect(safeRedirectTarget('')).toBe('/account')
    expect(safeRedirectTarget(null)).toBe('/account')
    expect(safeRedirectTarget(undefined)).toBe('/account')
  })

  it('앞뒤 공백과 제어문자에 속지 않는다', () => {
    // 브라우저는 URL 앞뒤의 공백·제어문자를 떼고 해석한다.
    expect(safeRedirectTarget('  //evil.test')).toBe('/account')
    expect(safeRedirectTarget('\n/\\evil.test')).toBe('/account')
    expect(safeRedirectTarget('  /account  ')).toBe('/account')
  })

  it('경로 안의 하이픈과 한글을 깎지 않는다', () => {
    // 앞뒤 정리 범위를 넓게 잡으면 정상 경로가 망가진다.
    expect(safeRedirectTarget('/feed?q=런지-2')).toBe('/feed?q=런지-2')
    expect(safeRedirectTarget('/?q=벤치-프레스')).toBe('/?q=벤치-프레스')
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/unit/redirectTarget.test.ts`
Expected: FAIL — `Cannot find module '@/features/account/redirectTarget'`

- [ ] **Step 3: 구현한다**

`src/features/account/redirectTarget.ts`:

```ts
/** 검증을 통과하지 못한 값이 갈 곳. */
export const DEFAULT_REDIRECT = '/account'

/**
 * 앞뒤의 공백류와 제어문자를 떼어낸다. 브라우저도 URL 을 해석하기 전에 같은 일을
 * 하므로, 여기서 먼저 떼지 않으면 "  //evil.test" 가 검사를 통과한다.
 *
 * 정규식 대신 코드 단위 비교를 쓴다. `c <= ' '` 는 0x00~0x20, 즉 공백류와 C0
 * 제어문자를 정확히 덮는다. 문자 클래스에 제어문자 이스케이프를 적는 방식은
 * 범위를 잘못 잡기 쉽다 — 예컨대 하이픈까지 깎으면 `/feed?q=런지-2` 가 망가진다.
 */
function stripEdges(value: string): string {
  let start = 0
  let end = value.length
  while (start < end && value[start] <= ' ') start += 1
  while (end > start && value[end - 1] <= ' ') end -= 1
  return value.slice(start, end)
}

/**
 * OAuth 콜백의 `next` 파라미터를 앱 내부 경로로 좁힌다.
 *
 * 이 값은 공격자가 URL 하나로 정할 수 있다. 그대로 따르면 우리 도메인의 로그인
 * 링크가 피싱 사이트로 사람을 보낸다 — 사용자는 우리 도메인을 보고 눌렀으므로
 * 도착한 곳을 의심하지 않는다.
 *
 * 허용 조건은 하나다: `/` 로 시작하되 `//` 나 `/\` 로 시작하지 않을 것.
 * `//evil.test` 는 프로토콜 상대 URL 이라 외부로 나가고, `/\evil.test` 는 일부
 * 브라우저가 `//` 로 정규화한다.
 */
export function safeRedirectTarget(raw: string | null | undefined): string {
  if (!raw) return DEFAULT_REDIRECT

  const value = stripEdges(raw)

  if (!value.startsWith('/')) return DEFAULT_REDIRECT
  if (value.startsWith('//') || value.startsWith('/\\')) return DEFAULT_REDIRECT

  return value
}
```

- [ ] **Step 4: 테스트 통과를 확인한다**

Run: `npx vitest run tests/unit/redirectTarget.test.ts`
Expected: PASS (8개)

- [ ] **Step 5: 커밋**

```bash
git add src/features/account/redirectTarget.ts tests/unit/redirectTarget.test.ts
git commit -m "feat: OAuth 콜백의 next 파라미터를 앱 내부 경로로 좁힌다

이 값은 공격자가 URL 하나로 정할 수 있다. 그대로 따르면 우리 도메인의 로그인
링크가 피싱 사이트로 사람을 보낸다 — 사용자는 우리 도메인을 보고 눌렀으므로
도착한 곳을 의심하지 않는다.

'/ 로 시작하는지'만 보는 검사는 //evil.test 에 뚫린다. 프로토콜 상대 URL 이라
브라우저가 https://evil.test 로 해석한다. 역슬래시 변형과 앞뒤 공백·제어문자
우회도 함께 막는다."
```

---

### Task 4: Supabase 서버·브라우저 클라이언트와 세션 조회

**Files:**
- Create: `src/lib/supabase/server.ts`, `src/lib/supabase/browser.ts`, `src/features/account/session.ts`
- Modify: `package.json` (의존성 추가)
- Test: `tests/unit/accountSession.test.ts`

**Interfaces:**
- Consumes: `supabasePublicConfig()` (Task 1)
- Produces:
  - `createSupabaseServerClient(): Promise<SupabaseClient | null>`
  - `createSupabaseBrowserClient(): SupabaseClient | null`
  - `type AccountRole = 'user' | 'admin'`
  - `type AccountUser = { id: string; email: string | null; role: AccountRole }`
  - `roleFromProfile(profile: { role?: string | null } | null): AccountRole`
  - `getAccountUser(): Promise<AccountUser | null>`

- [ ] **Step 1: 의존성을 추가한다**

```bash
npm install @supabase/ssr@^0.12.7
```

`devDependencies` 가 아니라 `dependencies` 다 — 런타임에 쓴다.

- [ ] **Step 2: 실패하는 테스트를 쓴다**

`tests/unit/accountSession.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { roleFromProfile } from '@/features/account/session'

describe('roleFromProfile', () => {
  it('admin 을 그대로 읽는다', () => {
    expect(roleFromProfile({ role: 'admin' })).toBe('admin')
  })

  it('user 를 그대로 읽는다', () => {
    expect(roleFromProfile({ role: 'user' })).toBe('user')
  })

  it('프로필이 없으면 일반 사용자로 본다', () => {
    // 트리거가 한 번 실패한 사용자가 앱에 영영 못 들어오면 안 된다.
    // 그리고 '없으면 일반 사용자' 가 안전한 방향이다 — 관리자 권한이
    // 실수로 열리는 쪽이 아니다.
    expect(roleFromProfile(null)).toBe('user')
  })

  it('모르는 값은 일반 사용자로 본다', () => {
    expect(roleFromProfile({ role: 'superadmin' })).toBe('user')
    expect(roleFromProfile({ role: '' })).toBe('user')
    expect(roleFromProfile({ role: null })).toBe('user')
    expect(roleFromProfile({})).toBe('user')
  })
})
```

- [ ] **Step 3: 실패를 확인한다**

Run: `npx vitest run tests/unit/accountSession.test.ts`
Expected: FAIL — `Cannot find module '@/features/account/session'`

- [ ] **Step 4: 서버 클라이언트를 만든다**

`src/lib/supabase/server.ts`:

```ts
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabasePublicConfig } from './env'

/**
 * 서버에서 쓰는 anon 클라이언트. **RLS 가 적용된다.**
 *
 * service.ts 와 절대 섞지 말 것 — 그쪽은 RLS 를 우회한다.
 * 사용자 데이터를 다루는 서버 코드는 전부 이 함수를 쓴다.
 *
 * 요청마다 새로 만든다. 클라이언트가 그 요청의 쿠키를 들고 있어서, 재사용하면
 * 한 사용자의 세션이 다른 요청에 섞인다.
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient | null> {
  const config = supabasePublicConfig()
  if (!config) return null

  const cookieStore = await cookies()

  return createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        /*
          서버 컴포넌트에서는 쿠키를 쓸 수 없어 Next 가 예외를 던진다.
          그건 오류가 아니다 — 토큰 갱신은 proxy.ts 가 맡고, 여기서는 읽기만
          성공하면 된다. 삼키지 않으면 렌더가 통째로 실패한다.
        */
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // proxy.ts 가 갱신을 책임진다.
        }
      },
    },
  })
}
```

- [ ] **Step 5: 브라우저 클라이언트를 만든다**

`src/lib/supabase/browser.ts`:

```ts
'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabasePublicConfig } from './env'

/**
 * 브라우저에서 쓰는 anon 클라이언트. **RLS 가 적용된다.**
 *
 * 설정이 없으면 null 이다. 그때 화면은 로그인 버튼을 비활성으로 두고 이유를
 * 적는다 — 캐시가 없을 때 앱이 그냥 동작하는 것과 같은 태도다.
 *
 * @supabase/ssr 이 내부적으로 싱글턴을 유지하므로 여기서 캐시하지 않는다.
 */
export function createSupabaseBrowserClient(): SupabaseClient | null {
  const config = supabasePublicConfig()
  if (!config) return null
  return createBrowserClient(config.url, config.anonKey)
}
```

- [ ] **Step 6: 세션 조회를 만든다**

`src/features/account/session.ts`:

```ts
import { createSupabaseServerClient } from '@/lib/supabase/server'

export type AccountRole = 'user' | 'admin'

export type AccountUser = {
  id: string
  email: string | null
  role: AccountRole
}

/**
 * 프로필 행에서 역할을 읽는다.
 *
 * 프로필이 없거나 모르는 값이면 일반 사용자로 본다. 두 가지 이유다.
 * 1. 트리거가 한 번 실패한 사용자가 앱에 영영 못 들어오면 안 된다.
 * 2. '없으면 일반 사용자' 가 안전한 방향이다 — 관리자 권한이 실수로 열리는 쪽이 아니다.
 */
export function roleFromProfile(profile: { role?: string | null } | null): AccountRole {
  return profile?.role === 'admin' ? 'admin' : 'user'
}

/**
 * 지금 로그인한 사용자. 비로그인이거나 Supabase 미설정이면 null.
 *
 * getUser() 를 쓴다. getSession() 은 쿠키를 그대로 믿지만 getUser() 는 Supabase 에
 * 물어 토큰을 검증한다. 쿠키는 클라이언트가 보내는 값이라 서버에서 권한 판단의
 * 근거로 삼으려면 검증된 쪽이어야 한다.
 */
export async function getAccountUser(): Promise<AccountUser | null> {
  const supabase = await createSupabaseServerClient()
  if (!supabase) return null

  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return null

  // 프로필 조회가 실패해도 로그인 자체는 유효하다. 역할만 기본값으로 떨어진다.
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', data.user.id)
    .maybeSingle()

  return {
    id: data.user.id,
    email: data.user.email ?? null,
    role: roleFromProfile(profile),
  }
}
```

- [ ] **Step 7: 테스트 통과를 확인한다**

Run: `npx vitest run tests/unit/accountSession.test.ts`
Expected: PASS (4개)

- [ ] **Step 8: 타입과 린트를 확인한다**

```bash
npx tsc --noEmit && npm run lint -- --max-warnings 0
```

Expected: 둘 다 무결.

- [ ] **Step 9: 커밋**

```bash
git add -A
git commit -m "feat: RLS 가 적용되는 서버·브라우저 Supabase 클라이언트를 추가한다

service.ts 는 RLS 를 우회하므로 사용자 데이터에 쓸 수 없다. 사용자 쿼리가 가는
길을 따로 만들고 이름으로 구분한다.

세션 조회는 getSession() 이 아니라 getUser() 를 쓴다. getSession() 은 쿠키를
그대로 믿지만 getUser() 는 토큰을 Supabase 에 검증받는다. 쿠키는 클라이언트가
보내는 값이라 서버에서 권한 판단의 근거로 삼으려면 검증된 쪽이어야 한다.

프로필이 없거나 모르는 값이면 일반 사용자로 본다 — 트리거가 한 번 실패한
사용자가 앱에 못 들어오면 안 되고, 관리자 권한이 실수로 열리는 방향도 아니다."
```

---

### Task 5: 세션 갱신 proxy 와 CSP 수정

**Files:**
- Create: `proxy.ts` (프로젝트 루트)
- Modify: `next.config.ts`
- Test: `tests/unit/csp.test.ts`

**Interfaces:**
- Consumes: 없음. `proxy.ts` 와 `next.config.ts` 는 `process.env` 를 직접 읽는다 — 둘 다 `src/` 밖이고, 특히 proxy 는 엣지에서 도는 파일이라 앱 모듈 그래프를 끌어들이지 않는 편이 안전하다
- Produces: `buildCsp(supabaseUrl: string | undefined): string` — `next.config.ts` 에서 export. Task 3~4 와 겹치는 이름 없음

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/unit/csp.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildCsp } from '../../next.config'

function directive(csp: string, name: string): string {
  const found = csp.split('; ').find((part) => part.startsWith(`${name} `))
  return found ?? ''
}

describe('buildCsp', () => {
  it('Supabase 주소가 있으면 connect-src 에 그 오리진만 넣는다', () => {
    const csp = buildCsp('https://abcd.supabase.co')

    expect(directive(csp, 'connect-src')).toBe("connect-src 'self' https://abcd.supabase.co")
  })

  it('경로가 붙어 있어도 오리진만 쓴다', () => {
    const csp = buildCsp('https://abcd.supabase.co/rest/v1')

    expect(directive(csp, 'connect-src')).toBe("connect-src 'self' https://abcd.supabase.co")
  })

  it('와일드카드로 열지 않는다', () => {
    // *.supabase.co 로 열면 남의 프로젝트까지 허용된다.
    expect(buildCsp('https://abcd.supabase.co')).not.toContain('*.supabase.co')
  })

  it('주소가 없으면 self 만 남는다', () => {
    // 로컬·E2E 기본값이다. 그 환경에서는 로그인 버튼이 비활성이라 XHR 이 나가지 않는다.
    expect(directive(buildCsp(undefined), 'connect-src')).toBe("connect-src 'self'")
    expect(directive(buildCsp(''), 'connect-src')).toBe("connect-src 'self'")
  })

  it('망가진 주소에 죽지 않는다', () => {
    expect(directive(buildCsp('not a url'), 'connect-src')).toBe("connect-src 'self'")
  })

  it('기존 지시어를 유지한다', () => {
    const csp = buildCsp(undefined)

    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain('https://www.youtube.com')
    expect(csp).toContain('https://i.ytimg.com')
    expect(csp).not.toContain('unsafe-eval')
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/unit/csp.test.ts`
Expected: FAIL — `buildCsp` 가 export 되지 않음

- [ ] **Step 3: next.config.ts 를 고친다**

`CSP_DIRECTIVES` 상수를 지우고 함수로 바꾼다. `connect-src` 줄만 달라지고 나머지는 그대로다.

```ts
/**
 * Supabase 오리진만 추출한다. 브라우저 Supabase 클라이언트가 이 주소로 XHR 을 보낸다.
 *
 * `*.supabase.co` 처럼 와일드카드로 열지 않는다 — 남의 Supabase 프로젝트까지
 * 허용할 이유가 없다. 주소가 없거나 망가졌으면 아무것도 추가하지 않는다.
 * 그 환경에서는 로그인 버튼이 비활성이라 XHR 이 나가지 않는다.
 */
function supabaseOrigin(rawUrl: string | undefined): string | null {
  if (!rawUrl) return null
  try {
    return new URL(rawUrl).origin
  } catch {
    return null
  }
}

export function buildCsp(supabaseUrl: string | undefined): string {
  const origin = supabaseOrigin(supabaseUrl)

  return [
    "default-src 'self'",
    "img-src 'self' https://i.ytimg.com data: blob:",
    'frame-src https://www.youtube.com https://www.youtube-nocookie.com',
    "font-src 'self'",
    // 브라우저 Supabase 클라이언트가 여기로 XHR 을 보낸다. 빠지면 로그인이 죽는다.
    `connect-src 'self'${origin ? ` ${origin}` : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self' 'unsafe-inline'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
  ].join('; ')
}
```

그리고 `headers()` 안의 값을 바꾼다:

```ts
          {
            key: 'Content-Security-Policy-Report-Only',
            value: buildCsp(process.env.NEXT_PUBLIC_SUPABASE_URL),
          },
```

기존 `script-src` 주석(“'unsafe-eval' 은 넣지 않는다 — 3D 모델과 하이드레이션 모두 없이 동작하는 것을 확인했다”)은 그대로 옮겨 둔다.

- [ ] **Step 4: 테스트 통과를 확인한다**

Run: `npx vitest run tests/unit/csp.test.ts`
Expected: PASS (6개)

- [ ] **Step 5: proxy.ts 를 만든다**

프로젝트 루트에 `proxy.ts`:

```ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Supabase 세션 갱신.
 *
 * 액세스 토큰은 1시간 만료다. 갱신이 없으면 사용자가 한 시간 뒤 조용히 로그아웃된다.
 * 서버 컴포넌트에서는 쿠키를 쓸 수 없으므로 갱신은 여기서만 가능하다.
 *
 * proxy 는 CDN 에 배포될 수 있어 공유 모듈이나 전역에 기대면 안 된다. 이 함수는
 * 요청의 쿠키만 다루므로 그 제약에 걸리지 않는다.
 */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  // Supabase 미설정이면 할 일이 없다. 로컬 개발의 기본값이다.
  if (!url || !anonKey) return NextResponse.next({ request })

  let response = NextResponse.next({ request })

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value)
        }
        // 요청 쿠키를 갱신한 뒤 응답을 다시 만들어야 이번 렌더가 새 토큰을 본다.
        response = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options)
        }
      },
    },
  })

  // 반드시 불러야 한다. 이 호출이 만료된 토큰을 갱신하고 위 setAll 을 깨운다.
  await supabase.auth.getUser()

  return response
}

/**
 * 정적 자산을 제외한다.
 *
 * 이 앱은 폰트 조각 92개(3.1MB)와 3D 모델(761KB)을 자가호스팅한다. 좁히지 않으면
 * 그것이 전부 proxy 를 지나간다.
 */
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|fonts/|models/).*)'],
}
```

- [ ] **Step 6: 검증 4종을 돌린다**

```bash
npx tsc --noEmit && npm run lint -- --max-warnings 0 && npm test && npm run test:e2e
```

Expected: tsc 0, lint 0, E2E 13개 통과.

단위 테스트 수는 이렇게 쌓인다: 기준 154 + Task 1의 3 + Task 3의 8 + Task 4의 4 + Task 5의 6 = **175**.

E2E 가 통과해야 한다는 점이 중요하다. `proxy.ts` 가 모든 페이지 요청을 거치게 되었으므로, 익명 흐름이 그대로 동작하는지를 기존 13개가 지킨다.

- [ ] **Step 7: 커밋**

```bash
git add -A
git commit -m "feat: 세션 갱신 proxy 를 추가하고 CSP 가 로그인을 막지 않게 한다

Supabase 액세스 토큰은 1시간 만료다. 갱신이 없으면 사용자가 한 시간 뒤 조용히
로그아웃된다. 서버 컴포넌트에서는 쿠키를 쓸 수 없어 갱신은 proxy 에서만 가능하다.

matcher 로 정적 자산을 제외한다. 이 앱은 폰트 조각 92개(3.1MB)와 3D 모델(761KB)을
자가호스팅해서, 좁히지 않으면 그것이 전부 proxy 를 지나간다.

그리고 기존 CSP 의 connect-src 'self' 가 브라우저 Supabase 클라이언트의 XHR 을
막는다. Report-Only 라 지금은 조용하지만 강제로 올리는 순간 로그인이 죽는다.
빌드 시점에 NEXT_PUBLIC_SUPABASE_URL 의 오리진만 넣는다 — 와일드카드로 열면
남의 Supabase 프로젝트까지 허용된다."
```

---

### Task 6: "내 정보" 화면과 OAuth 콜백

**Files:**
- Create: `src/features/account/AccountPanel.tsx`, `src/app/account/page.tsx`, `src/app/auth/callback/route.ts`
- Modify: `tests/e2e/search-feed.spec.ts`

**Interfaces:**
- Consumes: `getAccountUser()`, `AccountUser` (Task 4), `createSupabaseBrowserClient()` (Task 4), `safeRedirectTarget()` (Task 3)
- Produces: `/account` 라우트, `/auth/callback` 라우트 핸들러

- [ ] **Step 1: OAuth 콜백 라우트를 만든다**

`src/app/auth/callback/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { DEFAULT_REDIRECT, safeRedirectTarget } from '@/features/account/redirectTarget'
import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * 구글 동의 후 Supabase 가 여기로 돌려보낸다.
 *
 * 실패는 전부 /account 로 돌아가 안내한다. 에러 화면을 띄우지 않는다 —
 * 로그인은 부가 기능이지 앱의 전제가 아니다.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const next = safeRedirectTarget(url.searchParams.get('next'))
  const code = url.searchParams.get('code')

  // 사용자가 구글에서 취소하면 code 대신 error 가 온다.
  if (url.searchParams.get('error') || !code) {
    return NextResponse.redirect(new URL(`${DEFAULT_REDIRECT}?auth=failed`, url.origin))
  }

  const supabase = await createSupabaseServerClient()
  if (!supabase) {
    return NextResponse.redirect(new URL(`${DEFAULT_REDIRECT}?auth=unconfigured`, url.origin))
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    return NextResponse.redirect(new URL(`${DEFAULT_REDIRECT}?auth=failed`, url.origin))
  }

  // next 는 safeRedirectTarget 을 지난 앱 내부 경로다.
  return NextResponse.redirect(new URL(next, url.origin))
}
```

- [ ] **Step 2: 화면 본문을 만든다**

`src/features/account/AccountPanel.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { BUTTON_PRIMARY, BUTTON_SECONDARY } from '@/components/ui/Button'
import { cardClass } from '@/components/ui/Card'
import { ICON_WEIGHT, WarningCircle } from '@/components/ui/icons'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import type { AccountUser } from './session'

/**
 * "내 정보" 화면 본문.
 *
 * 구글 프로필 사진을 쓰지 않는다. 이메일 첫 글자로 원을 그린다 —
 * lh3.googleusercontent.com 을 CSP img-src 에 열지 않아도 되고, 페이지마다
 * 구글로 요청이 나가지 않는다. 얻는 것에 비해 붙는 것이 많다.
 */
export default function AccountPanel({
  user,
  notice,
}: {
  user: AccountUser | null
  /** OAuth 콜백이 실패를 알릴 때 쓰는 값. */
  notice: 'failed' | 'unconfigured' | null
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const configured = createSupabaseBrowserClient() !== null

  async function signIn() {
    const supabase = createSupabaseBrowserClient()
    if (!supabase) return
    setBusy(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/account` },
    })
    // 성공하면 구글로 떠나므로 여기 도달하지 않는다.
    if (error) setBusy(false)
  }

  async function signOut() {
    const supabase = createSupabaseBrowserClient()
    if (!supabase) return
    setBusy(true)
    await supabase.auth.signOut()
    // 서버 컴포넌트가 들고 있는 사용자 정보를 다시 읽게 한다.
    router.refresh()
    setBusy(false)
  }

  return (
    <div className={cardClass('solid', 'p-6 sm:p-8')}>
      {notice ? (
        <p
          role="alert"
          data-testid="account-notice"
          className="mb-5 flex items-start gap-2 rounded-xl border border-danger/35 bg-danger/10 px-4 py-3 text-[13px] leading-relaxed text-text"
        >
          <WarningCircle
            size={16}
            weight={ICON_WEIGHT}
            aria-hidden
            className="mt-px shrink-0 text-danger"
          />
          {notice === 'failed'
            ? '로그인이 완료되지 않았어요. 다시 시도해 주세요.'
            : '로그인이 아직 설정되지 않았어요.'}
        </p>
      ) : null}

      {user ? (
        <>
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-lg font-bold text-accent-fg"
            >
              {(user.email ?? '?').slice(0, 1).toUpperCase()}
            </span>
            <p className="min-w-0 truncate text-[15px] font-semibold text-text">
              {user.email ?? '로그인됨'}
            </p>
          </div>

          <p className="mt-4 text-sm leading-relaxed text-muted">
            루틴은 아직 이 브라우저에만 저장돼요. 기기 간 이어보기는 준비 중이에요.
          </p>

          <button
            type="button"
            data-testid="sign-out"
            disabled={busy}
            onClick={signOut}
            className={`${BUTTON_SECONDARY} mt-5`}
          >
            로그아웃
          </button>
        </>
      ) : (
        <>
          <p className="text-[15px] font-semibold text-text">아직 로그인하지 않았어요.</p>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            루틴은 이 브라우저에만 저장돼요. 다른 기기에서는 보이지 않아요.
          </p>

          <button
            type="button"
            data-testid="sign-in"
            disabled={!configured || busy}
            onClick={signIn}
            className={`${BUTTON_PRIMARY} mt-5 disabled:pointer-events-none disabled:opacity-40`}
          >
            구글로 로그인
          </button>

          {!configured ? (
            <p className="mt-3 text-xs leading-relaxed text-dim">
              이 환경에는 Supabase 설정이 없어 로그인을 쓸 수 없어요.
              <br />
              NEXT_PUBLIC_SUPABASE_URL 과 NEXT_PUBLIC_SUPABASE_ANON_KEY 가 필요해요.
            </p>
          ) : null}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 3: 라우트를 만든다**

`src/app/account/page.tsx`:

```tsx
import type { Metadata } from 'next'
import AccountPanel from '@/features/account/AccountPanel'
import { getAccountUser } from '@/features/account/session'
import { firstParam } from '@/features/search/searchParams'

export const metadata: Metadata = {
  title: '내 정보',
}

/**
 * 단계 A 에서는 탭바에 넣지 않는다. 주소로만 닿는다.
 *
 * 로그인해도 사용자에게 달라지는 것이 없기 때문이다 — "동기화됨" 은 거짓이고
 * 아무 말도 안 하면 왜 로그인했는지 알 수 없다. 루틴 동기화(단계 B)가 끝날 때
 * TABS 에 추가해 함께 노출한다.
 */
export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ auth?: string | string[] }>
}) {
  const params = await searchParams
  const raw = firstParam(params.auth)
  const notice = raw === 'failed' || raw === 'unconfigured' ? raw : null

  const user = await getAccountUser()

  return (
    <div className="mx-auto max-w-2xl">
      <header>
        <h1 className="text-[26px] font-extrabold tracking-tight sm:text-3xl md:text-[32px]">
          내 정보
        </h1>
      </header>

      <div className="mt-7">
        <AccountPanel user={user} notice={notice} />
      </div>
    </div>
  )
}
```

`/account` 는 `(tabs)` 그룹 밖이라 상단 헤더와 하단 탭바가 없다. 그대로 둔다 — 단계 A 에서는 노출하지 않는 화면이고, 단계 B 에서 `(tabs)` 안으로 옮기면서 탭을 추가한다.

- [ ] **Step 4: E2E 를 추가한다**

`tests/e2e/search-feed.spec.ts` 맨 끝에 붙인다:

```ts
test('내 정보 화면은 Supabase 없이도 동작한다', async ({ page }) => {
  // E2E 환경에는 NEXT_PUBLIC_SUPABASE_* 가 빈 값이다 (playwright.config.ts).
  // 그 상태에서 화면이 깨지지 않고 이유를 알려주는지 본다.
  await page.goto('/account')

  await expect(page.getByRole('heading', { name: '내 정보' })).toBeVisible()
  await expect(page.getByTestId('sign-in')).toBeDisabled()
  await expect(page.getByText('Supabase 설정이 없어')).toBeVisible()
})

test('로그인 실패는 에러 화면 대신 안내로 끝난다', async ({ page }) => {
  await page.goto('/account?auth=failed')

  await expect(page.getByTestId('account-notice')).toBeVisible()
  // 앱이 죽지 않고 화면이 그대로 있어야 한다.
  await expect(page.getByRole('heading', { name: '내 정보' })).toBeVisible()
})

test('OAuth 콜백이 외부 주소로 보내지 않는다', async ({ page }) => {
  // code 가 없으므로 실패 경로를 탄다. next 가 외부여도 우리 도메인에 남아야 한다.
  await page.goto('/auth/callback?next=https://example.com')

  await expect(page).toHaveURL(/\/account\?auth=failed/)
})
```

- [ ] **Step 5: 검증 4종을 돌린다**

```bash
npx tsc --noEmit && npm run lint -- --max-warnings 0 && npm test && npm run test:e2e
```

Expected: tsc 0, lint 0, 단위 175개 통과, E2E 16개 통과(13 + 신규 3).

- [ ] **Step 6: 커밋**

```bash
git add -A
git commit -m "feat: 내 정보 화면과 구글 OAuth 콜백을 추가한다

탭바에는 넣지 않는다. 로그인해도 사용자에게 달라지는 것이 없어서 '동기화됨' 은
거짓이고 아무 말도 안 하면 왜 로그인했는지 알 수 없다. 루틴 동기화가 끝날 때
TABS 에 추가해 함께 노출한다.

실패는 전부 /account 로 돌아가 안내로 끝난다. 에러 화면을 띄우지 않는다 —
로그인은 부가 기능이지 앱의 전제가 아니다. Supabase 미설정이면 버튼을 비활성으로
두고 이유를 적는다.

구글 프로필 사진을 쓰지 않는다. 이메일 첫 글자로 원을 그리면 CSP img-src 에
lh3.googleusercontent.com 을 열지 않아도 되고 페이지마다 구글로 요청이 나가지 않는다."
```

---

### Task 7: 배포 후 수동 확인

**자동화할 수 없는 부분이다.** 실제 구글 계정과 동의 화면이 필요해 CI 에서 돌릴 수 없다. Supabase 로컬 스택을 띄우는 방법이 있지만 이 규모에는 과하다.

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: Task 1~6 전부
- Produces: 없음 (문서)

- [ ] **Step 1: 사전 준비가 끝났는지 확인한다**

이 문서 맨 위 "사전 준비" 6개가 전부 끝나 있어야 한다. `.env.local` 에 실제 값이 들어 있어야 한다.

- [ ] **Step 2: 로컬에서 왕복을 확인한다**

```bash
npm run dev
```

브라우저에서 `http://localhost:3000/account` 를 열고 순서대로 확인한다.

1. `구글로 로그인` 버튼이 **활성**이다 (비활성이면 `.env.local` 을 다시 본다)
2. 누르면 구글 동의 화면이 뜬다
3. 동의하면 `/account` 로 돌아오고 이메일이 보인다
4. 개발자도구 → Application → Cookies 에 `sb-` 로 시작하는 쿠키가 있다
5. 새로고침해도 로그인이 유지된다
6. `로그아웃` 을 누르면 로그인 전 화면으로 돌아간다
7. **로그아웃 뒤 `/routines` 에 루틴이 그대로 있다** — 로컬 루틴은 계정이 아니라 브라우저의 것이다

- [ ] **Step 3: 취소 경로를 확인한다**

로그아웃 상태에서 `구글로 로그인` → 구글 화면에서 **취소**. `/account` 로 돌아와 안내가 뜨고 앱이 정상인지 본다.

- [ ] **Step 4: 프로필과 역할을 확인한다**

Supabase 콘솔 → Table Editor → `profiles` 에 방금 가입한 행이 있는지 본다. 없으면 `0003` 마이그레이션을 실행하지 않은 것이다.

역할을 바꿔 본다:

```sql
update public.profiles set role = 'admin' where id = '<본인 uuid>';
```

아직 관리자 전용 화면이 없으므로 `role` 이 바뀌는 것까지만 확인한다.

- [ ] **Step 5: 세션 갱신을 확인한다**

Supabase 콘솔 → Authentication → Sessions 에서 JWT 만료를 짧게(예: 60초) 바꾼 뒤, 그 시간이 지나고 새로고침했을 때 로그인이 유지되는지 본다. 확인 후 원래 값으로 되돌린다.

유지되지 않으면 `proxy.ts` 의 `matcher` 가 해당 경로를 제외하고 있는지 의심한다.

- [ ] **Step 6: README 에 확인 목록을 남긴다**

README 에 절을 추가한다:

```markdown
## 로그인

구글 OAuth 하나만 지원한다. 로그인은 **선택**이다 — 비로그인 상태로도 검색·재생·루틴이
전부 동작하고, 로그인은 나중에 기기 간 동기화(단계 B)를 켜기 위한 토대다.

설정: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` 와 Supabase 대시보드의
Google Provider. 비어 있으면 로그인 버튼이 비활성이고 나머지 앱은 정상 동작한다.

실제 OAuth 왕복은 CI 에서 검증할 수 없다(진짜 구글 계정과 동의 화면이 필요하다).
`docs/superpowers/plans/2026-09-19-auth-foundation.md` 의 Task 7 이 수동 확인 목록이다.

관리자 승격은 UI 가 없다. Supabase 콘솔에서 직접 바꾼다:
`update public.profiles set role = 'admin' where id = '<uuid>';`
```

- [ ] **Step 7: 커밋**

```bash
git add README.md
git commit -m "docs: 로그인 설정과 수동 확인 절차를 README 에 적는다

실제 구글 OAuth 왕복은 CI 에서 검증할 수 없다. '테스트가 다 통과했다' 가 그
왕복까지 검증했다는 뜻이 아니라는 것을 나중에 읽는 사람이 알아야 한다."
```

---

## 완료 기준

- [ ] `npx tsc --noEmit` 0 에러
- [ ] `npm run lint -- --max-warnings 0` 0 경고
- [ ] `npm test` 175개 통과 (154 → 175)
- [ ] `npm run test:e2e` 16개 통과
- [ ] `grep -rn "process.env.SUPABASE_URL" src tests scripts playwright.config.ts` 결과 없음
- [ ] `TABS` 배열이 변하지 않았다 (`git diff main -- src/components/nav/navigation.ts` 가 비어 있다)
- [ ] Task 7 수동 확인 7단계 전부 통과
- [ ] 비로그인 상태로 검색·재생·루틴 담기·루틴 재생이 전과 같이 동작한다

## 다음 단계

**B. 루틴 동기화** — 이 계획이 만든 토대 위에서 루틴을 서버로 옮긴다. 그때 `/account` 를
`(tabs)` 안으로 옮기고 `TABS` 에 "내 정보"를 추가해 함께 노출한다. 첫 로그인 시 기존
로컬 루틴을 어떻게 이전할지가 그 설계의 핵심 질문이다.
