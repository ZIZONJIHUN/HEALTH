# 인증 기반 설계

작성일: 2026-09-19
범위: 계정 체계의 토대. 로그인·로그아웃과 역할(role)까지.

## 1. 이 문서의 자리

원래 설계 문서(`2026-07-25-health-shorts-gymwear-design.md`)는 로그인을 3단계에 두고
`profiles`·`favorites` 를 함께 묶었다. 그 뒤 앱이 계획에서 갈라졌다 — 설계에 없던
**루틴**(순서 있는 목록)이 만들어졌고, 의류 카탈로그와 즐겨찾기는 아직 없다.

그래서 "로그인"은 한 덩어리가 아니라 네 조각이다.

| | 무엇 | 의존 |
|---|---|---|
| **A. 인증 기반** ← **이 문서** | Supabase Auth, 세션, `profiles`+`role`, RLS 토대, "내 정보" | — |
| B. 루틴 동기화 | 루틴을 localStorage → 서버로. 기존 로컬 데이터 이전 | A |
| C. 즐겨찾기 | 영상 즐겨찾기 + "저장" 탭 | A |
| D. 의류 카탈로그 + 관리자 | `brands`/`products`, 3축 필터, 관리자 화면 | A |

**A 는 단독으로 사용자에게 노출하지 않는다.** 로그인해도 달라지는 것이 없어서
"동기화됨"은 거짓이고 아무 말도 안 하면 왜 로그인했는지 알 수 없다. A 는 탭바에
들어가지 않은 채 머지되고, B 가 끝날 때 함께 노출된다.

**C 를 설계할 때 정리할 충돌이 있다.** 루틴과 즐겨찾기는 둘 다 "영상을 담아두는 곳"이라
나란히 두면 사용자가 매번 "이건 어디 담지"를 고민한다. 다만 D(의류)에는 즐겨찾기가
여전히 의미가 있어서, C 의 범위가 "영상+의류"인지 "의류만"인지가 갈린다. A 에서는
결정하지 않는다.

## 2. 결정 사항

| 항목 | 결정 | 근거 |
|---|---|---|
| 로그인 수단 | **구글 OAuth 하나** | YouTube API 키 때문에 이미 GCP 프로젝트가 있다. 동의 화면만 추가하면 되고 사업자 등록도 SMTP 설정도 필요 없다 |
| 익명 사용 | **지금 그대로 전부 가능** | "검색해서 바로 본다"가 이 앱의 핵심이다. 가입 벽은 그것을 깬다. 로그인은 빼앗지 않고 더한다 |
| 진입점 | **"내 정보" 탭** (A 에서는 숨김) | 원래 설계의 네 번째 탭. 나중에 관리자 진입과 저장 목록도 여기 붙는다 |
| 계정 모델 | **`profiles` + `role` 을 지금 만든다** | 나중에 추가하면 기존 가입자를 백필해야 한다. 빠뜨리면 "관리자인데 관리자 화면이 안 보임"으로 나타나 원인 찾기가 번거롭다 |
| 루틴 테이블 | **만들지 않는다** | B 의 몫이다. 지금 만들면 쓰지 않는 스키마가 생기고, B 설계에서 모양이 바뀌면 빈 테이블을 고치는 마이그레이션을 또 쓴다 |
| `favorites` | **만들지 않는다** | C 의 몫이고 루틴과의 충돌을 먼저 정리해야 한다 |
| 관리자 승격 UI | **만들지 않는다** | 원래 설계의 제외 항목. 관리자가 한둘인 규모에서 승격 UI 는 권한 상승 취약점 표면만 만든다. Supabase 콘솔에서 직접 바꾼다 |

## 3. 클라이언트 경계

**이 설계에서 틀리면 가장 위험한 곳이다.**

지금 `src/lib/supabase.ts` 는 `service_role` 키를 쓴다. 이 키는 **RLS 를 통째로 우회한다.**
사용자 데이터를 다루는 코드가 실수로 이 클라이언트를 잡으면 RLS 를 아무리 잘 써도
남의 데이터가 보인다. 이름으로 구분되게 셋으로 나눈다.

| 모듈 | 키 | RLS | 쓰는 곳 |
|---|---|---|---|
| `lib/supabase/service.ts` (기존 파일 이동) | `service_role` | **우회** | 검색 캐시, 호출 예산 — 사용자와 무관한 것만 |
| `lib/supabase/server.ts` | `anon` + 사용자 쿠키 | 적용 | 서버 컴포넌트, 라우트 핸들러 |
| `lib/supabase/browser.ts` | `anon` + 쿠키 | 적용 | 클라이언트 컴포넌트 |

`service.ts` 상단에 "사용자 데이터에 쓰지 말 것"과, 이 키가 닿는 테이블이
`search_cache`·`api_budget` 둘뿐이라는 사실을 함께 적는다.

### 환경변수

URL 이 서버·브라우저 양쪽에 필요하다. 따로 두면 언젠가 어긋난다.

```
NEXT_PUBLIC_SUPABASE_URL        ← 하나로 통일 (공개돼도 안전)
NEXT_PUBLIC_SUPABASE_ANON_KEY   ← 신규. RLS 가 지키므로 공개 전제 키
SUPABASE_SERVICE_ROLE_KEY       ← 서버 전용, 이름 그대로
```

`SUPABASE_URL` 을 읽던 곳을 전부 옮긴다: `service.ts`, `scripts/seed-cache.ts`,
`scripts/check-cache.ts`, `playwright.config.ts`, `.env.local.example`, README.

### 세션 갱신

Supabase 액세스 토큰은 1시간 만료다. 갱신이 없으면 사용자가 조용히 로그아웃된다.
Next 16 의 `proxy.ts`(구 `middleware.ts`)에서 갱신한다 — `request.cookies` / `response.cookies`
가 지원된다(`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`).

proxy 는 CDN 에 배포될 수 있어 공유 모듈·전역에 기대면 안 되는데, 이 패턴은 요청의
쿠키만 다뤄서 그 제약에 걸리지 않는다.

**matcher 를 반드시 좁힌다.** 이 앱은 폰트 조각 92개(3.1MB)와 3D 모델(761KB)을
자가호스팅해서, 안 좁히면 그게 전부 proxy 를 지나간다.

```ts
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|fonts/|models/).*)'],
}
```

비로그인 사용자에게는 쿠키가 없어 proxy 가 즉시 빠져나오므로 익명 경로의 비용은
사실상 그대로다.

### Supabase 미설정일 때

지금 캐시가 하는 것과 같은 태도를 유지한다 — 로그인 버튼을 비활성으로 두고 이유를
적는다. 현재 `.env.local` 의 `SUPABASE_*` 가 비어 있어서, 이 처리가 없으면 로컬 개발이
그냥 깨진다.

## 4. 데이터 모델

```sql
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  role       text not null default 'user' check (role in ('user','admin')),
  created_at timestamptz not null default now()
);
```

**`on delete cascade`** — 계정을 지우면 프로필도 사라져야 한다. 안 걸면 `auth.users` 에
없는 고아 행이 남고, 같은 이메일로 재가입하면 UUID 가 달라 새 프로필이 생기면서
옛 행이 영원히 남는다.

**가입 시 트리거로 자동 생성** — 앱 코드에서 만들면 언젠가 빠뜨린다. OAuth 콜백에서만
만들면 다른 경로로 가입한 사용자가 프로필 없이 남고, 그 사용자는 `role` 조회가 `null`
이라 관리자 판정에서 이상하게 동작한다.

```sql
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();
```

`security definer` 가 필요하다 — 트리거는 가입하는 사용자 권한으로 돌아서
`public.profiles` 에 쓸 권한이 없다. 대신 **`set search_path = ''` 로 검색 경로 하이재킹을
막고 모든 이름을 스키마까지 적는다.** `security definer` 함수에서 이 둘을 빠뜨리는 것이
Postgres 의 전형적인 권한 상승 경로다.

### RLS — 읽기만 본인, 쓰기는 아무도 못 함

```sql
alter table public.profiles enable row level security;

create policy "본인 프로필 읽기" on public.profiles
  for select using (auth.uid() = id);
```

`insert`/`update`/`delete` 정책을 **일부러 만들지 않는다.** 정책이 없으면 `anon`·
`authenticated` 는 아무것도 못 한다. 생성은 트리거가, 역할 변경은 `service_role` 이나
콘솔이 한다.

원래 설계 문서는 profiles 쓰기를 "본인 (`role` 변경은 서버만)"으로 적었지만, **지금
프로필에 본인이 고칠 필드가 하나도 없다.** 닉네임·프로필 사진이 생기면 그때 그 열에
한정한 `update` 정책을 연다. 지금 여는 것은 쓸 데 없는 권한이다.

## 5. 화면과 흐름

라우트 둘만 추가된다.

- `/account` — "내 정보"
- `/auth/callback` — OAuth 콜백 (라우트 핸들러, 화면 없음)

**A 에서는 `TABS` 배열을 건드리지 않는다.** `/account` 는 주소로만 닿는다. B 에서 루틴
동기화가 붙을 때 탭을 추가한다. 플래그 장치를 따로 만들 필요가 없다.

```
[내 정보] 구글로 로그인 클릭
  → signInWithOAuth({ provider: 'google', redirectTo: /auth/callback?next=/account })
  → 구글 동의 → Supabase → /auth/callback?code=...
  → exchangeCodeForSession(code) → 쿠키 설정 → next 로 이동
```

### 조심할 것 셋

**`next` 파라미터는 오픈 리다이렉트 통로다.** `/auth/callback?next=https://evil.test` 를
그대로 따르면 우리 도메인의 로그인 링크가 피싱 사이트로 사람을 보낸다.
**`/` 로 시작하되 `//` 로 시작하지 않는 경로만** 허용하고, 아니면 `/account` 로 보낸다.
(`//evil.test` 는 프로토콜 상대 URL 이라 외부로 나간다.)

**지금 CSP 가 로그인을 깨뜨린다.** 브라우저 Supabase 클라이언트가 `supabase.co` 로 XHR 을
보내는데 `connect-src 'self'` 에 막힌다. 지금은 Report-Only 라 조용하지만 강제로 올리는
순간 로그인이 죽는다.

CSP 는 `next.config.ts` 에서 만들어지므로 **빌드 시점에 `NEXT_PUBLIC_SUPABASE_URL` 을 읽어
그 오리진만** `connect-src` 에 넣는다. `*.supabase.co` 처럼 와일드카드로 열지 않는다 —
남의 Supabase 프로젝트까지 허용할 이유가 없다.

환경변수가 없으면(로컬·E2E 기본값) 아무것도 추가하지 않는다. 그 환경에서는 어차피
로그인 버튼이 비활성이라 XHR 이 나가지 않는다. 즉 **E2E 헤더 테스트는 `connect-src` 에
Supabase 가 들어가는지를 단정할 수 없다.** 대신 단위 테스트로 "URL 이 주어지면 그
오리진이 들어가고, 없으면 `'self'` 만 남는다"를 검증한다.

**구글 프로필 사진을 쓰지 않는다.** 이메일 첫 글자로 원을 그린다.
`lh3.googleusercontent.com` 을 `img-src` 에 열지 않아도 되고, 페이지마다 구글로 요청이
나가지 않는다. 얻는 것에 비해 붙는 것이 많다.

### 화면 상태

| 상태 | 보이는 것 |
|---|---|
| 비로그인 | `구글로 로그인` + "루틴은 이 브라우저에만 저장돼요" |
| 로그인 | 이메일, `로그아웃` |
| Supabase 미설정 | 버튼 비활성 + 이유 |
| OAuth 취소·실패 | `/account` 로 돌아와 안내. 앱은 정상 |

**A 에서는 "동기화됨"을 쓰지 않는다.** 아직 사실이 아니다. B 에서 루틴이 서버로 간 뒤에
그 문장이 생긴다.

**로그아웃해도 로컬 루틴을 지우지 않는다.** 그 루틴은 계정이 아니라 브라우저의 것이다.
지우면 로그인해본 적 있다는 이유로 데이터를 잃는다.

## 6. 오류 처리

실패는 전부 **"앱은 멀쩡하고 로그인만 안 된 상태"**로 수렴한다. 로그인은 부가 기능이지
앱의 전제가 아니다 — 캐시를 다루는 태도와 같다.

| 언제 | 어떻게 |
|---|---|
| Supabase 미설정 | 버튼 비활성 + 이유. 나머지 화면 정상 |
| 구글에서 취소 | `/account` 로 돌아와 안내. 에러 화면 아님 |
| code 교환 실패 | 같음 |
| 세션 갱신 실패 | **조용히** 비로그인 상태로. 경고를 띄우지 않음 |
| 트리거 누락으로 프로필 없음 | `role` 을 `'user'` 로 간주. 죽지 않음 |

마지막 줄이 중요하다. 프로필 조회가 `null` 일 때 예외를 던지면 트리거가 한 번 실패한
사용자는 앱에 영영 못 들어온다. **없으면 일반 사용자**가 안전한 기본값이다 — 관리자
권한이 실수로 열리는 방향이 아니다.

## 7. 테스트

### 단위

순수 로직만 뽑아서 본다. `readPlayerMessage` 로 origin 검증을 뽑아낸 것과 같은 방식이다.

- **`next` 파라미터 검증** ← 오픈 리다이렉트 방어. `//evil.test`, `https://evil.test`,
  `/account`, `/`, 빈 값, 인코딩 우회. 이 함수가 보안 경계라 테스트가 유일한 방어다.
- 프로필 없음 → `role: 'user'`
- 환경변수 유무에 따른 클라이언트 생성 (미설정 시 `null`)
- CSP 조립: URL 이 있으면 그 오리진이 `connect-src` 에, 없으면 `'self'` 만

### E2E

- `/account` 비로그인 화면이 뜬다
- **Supabase 미설정이면 버튼이 비활성이다** — `playwright.config.ts` 의 env 블록을
  새 이름(`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`)으로 바꾸면서 빈 값 강제를 유지한다. 그 블록의 원래
  목적(E2E 가 실제 캐시를 건드리지 않게)도 그대로 지켜진다
- 기존 13개가 그대로 통과한다 (익명 흐름 회귀 방지)

`connect-src` 에 Supabase 가 들어가는지는 E2E 로 볼 수 없다 — 위 env 블록 때문에 E2E
환경에는 URL 이 없다. 단위 테스트가 그 자리를 맡는다.

### E2E 로 덮지 못하는 것

**실제 구글 OAuth 왕복.** 진짜 구글 계정과 동의 화면이 필요해 CI 에서 돌릴 수 없다.
Supabase 로컬 스택을 띄우는 방법이 있지만 이 규모에는 과하다.

숨기지 않고 적어둔다. "테스트가 다 통과했다"가 OAuth 왕복까지 검증했다는 뜻이 아니라는
것을 나중에 읽는 사람이 알아야 한다. 대신 배포 후 수동 확인 목록을 구현 계획에 넣는다:

1. 로그인 → 세션 쿠키 생성 확인
2. 새로고침해도 로그인 유지
3. 1시간 뒤 접속 시 자동 갱신 (또는 토큰 만료를 짧게 설정해 확인)
4. 로그아웃 → 쿠키 삭제
5. 로그아웃 후 로컬 루틴이 남아 있는지
6. Supabase 콘솔에서 `role='admin'` 으로 바꾼 뒤 반영되는지

## 8. 사전 준비 (사람이 해야 하는 일)

코드로 대신할 수 없다. 구현 전에 끝나 있어야 한다.

1. Supabase 프로젝트 생성 (없다면) — 검색 캐시용으로도 필요했다
2. 기존 마이그레이션 `0001`, `0002` 실행
3. Google Cloud Console → OAuth 동의 화면 + 웹 클라이언트 ID/시크릿 발급
4. Supabase 대시보드 → Authentication → Providers → Google 에 위 값 입력
5. 승인된 리디렉션 URI 에 Supabase 콜백 주소 등록
6. Supabase 의 Site URL 과 Redirect URLs 에 로컬(`http://localhost:3000`)과 배포 도메인 등록

## 9. 이 단계에서 하지 않는 것

- **루틴 동기화** — B. 이 문서의 결정들이 B 의 토대가 된다
- **즐겨찾기** — C. 루틴과의 충돌을 먼저 정리해야 한다
- **의류 카탈로그·관리자 화면** — D. `role` 만 여기서 준비한다
- **관리자 승격 UI** — 원래 설계의 제외 항목
- **구글 외의 로그인 수단** — 필요해지면 Supabase 설정에서 추가한다. 코드 변경은 provider 이름 한 줄
- **프로필 편집** — 지금 본인이 고칠 필드가 없다
