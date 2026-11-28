# 헬스 쇼츠

운동 이름을 검색하면 관련 쇼츠를 웹 내부에서 바로 재생하는 서비스.

설계 문서: `docs/superpowers/specs/2026-07-25-health-shorts-gymwear-design.md`

## 준비

1. `npm install`
2. `.env.local.example` 을 `.env.local` 로 복사한다.
3. [Google Cloud Console](https://console.cloud.google.com/)에서 YouTube Data API v3를 켜고 API 키를 발급해 `YOUTUBE_API_KEY` 에 넣는다.

이 세 단계만으로 앱은 완전히 동작한다. `SUPABASE_*` 는 선택 사항이다.

### Supabase는 선택이다

`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` 를 비워두면 검색 캐시가 프로세스 내부 메모리로
폴백한다 (`src/lib/searchCache.ts`). 같은 프로세스가 살아있는 동안은 같은 검색어를 반복해도
쿼터를 쓰지 않는다. 다만 이 캐시는 프로세스를 재시작하거나 인스턴스가 여러 개 떠 있으면
공유되지 않는다.

키가 세 개인 이유는 쓰임이 다르기 때문이다. **검색 캐시는 URL + `service_role` 키만**
쓰고, **로그인은 URL + `anon` 키**를 쓴다. 그래서 캐시만 켜고 로그인은 끈 상태,
또는 그 반대도 가능하다. 로그인 설정은 아래 "로그인" 절에 따로 적었다.

Supabase를 붙이면 캐시가 인스턴스 간, 재시작 간에도 유지된다. 개발 중 쿼터를 아끼거나
여러 사람이 같은 캐시를 공유하려면 다음을 설정한다.

1. Supabase 프로젝트를 만들고 SQL Editor에서 `supabase/migrations/0001_search_cache.sql` 을 실행한다.
2. Supabase 프로젝트 설정에서 URL과 `service_role` 키를 `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` 에 넣는다.
3. `npm run cache:check` 로 실제 쓰기→읽기 왕복이 되는지 확인한다. 마이그레이션 미실행,
   `anon` 키를 잘못 넣은 경우, 테이블/컬럼명 오타 등을 여기서 바로 잡아낸다.

`YOUTUBE_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` 는 서버에서만 읽는다. 클라이언트 번들에
포함되지 않으며, `NEXT_PUBLIC_` 접두사를 붙이지 않는다.

반대로 `NEXT_PUBLIC_SUPABASE_URL` 과 `NEXT_PUBLIC_SUPABASE_ANON_KEY` 는 브라우저에
들어간다. 공개돼도 안전하다 — `anon` 키로 할 수 있는 일은 RLS 가 정한 범위뿐이다.
`service_role` 키는 다르다. 그건 **RLS 를 통째로 우회하므로** 절대 `NEXT_PUBLIC_` 을
붙이지 않는다. 코드에서도 그 키를 쓰는 경로를 `src/lib/supabase/service.ts` 하나로
가둬 두고, 거기서 닿는 테이블은 `search_cache` 와 `api_budget` 뿐이다.

## 실행

```bash
npm run dev         # 개발 서버
npm test            # 단위 테스트
npm run test:e2e    # E2E (모의 YouTube 서버를 자동으로 띄운다)
npm run seed        # 인기 운동 20개 캐시 시드 (Supabase 필수 — 없으면 즉시 종료한다)
npm run cache:check # Supabase 캐시 왕복 확인
npm run auth:check  # 로그인 설정 확인 (마이그레이션·anon 키·RLS)
npm run sync:check  # 루틴 동기화 표 확인 (마이그레이션 0004·RLS)
```

## 에셋

폰트와 3D 모델은 빌드 결과물을 저장소에 커밋해 둔다. 배포 시 네트워크를 타지 않는다.
다시 만들 일이 생기면 아래 스크립트를 쓴다 (평소에는 실행할 필요가 없다).

```bash
node scripts/fetch-pretendard.mjs                        # Pretendard 자가호스팅 (public/fonts)
node --max-old-space-size=8192 scripts/build-body-model.mjs  # 3D 인체 모델 (public/models)
```

`build-body-model.mjs` 는 원본 STL 293MB 를 받아 `.cache/bodyparts3d/` 에 캐시하고
533KB GLB 로 굽는다. 처음 실행은 몇 분 걸린다.

해부 모델은 [BodyParts3D](https://lifesciencedb.jp/bp3d/), © The Database Center for Life
Science, licensed under CC Attribution-Share Alike 2.1 Japan. 앱 화면에도 표기가 들어간다
(`src/components/BodyPanel.tsx`).

E2E는 앱을 3000번이 아닌 **3100번 포트**에서 띄운다. 3000번을 다른 프로세스가 이미 점유하고
있으면 Playwright의 `reuseExistingServer` 가 그 프로세스를 재사용해 엉뚱한 앱을 테스트하는
사고가 있었기 때문이다 (`playwright.config.ts` 참고). E2E 스위트는 자체적으로 모의 YouTube
서버를 띄우므로 `YOUTUBE_API_KEY` 나 네트워크 연결 없이 실행할 수 있다.

## 쿼터 주의

YouTube Data API 일일 무료 쿼터는 10,000 units다. 검색 1회에 101 units가 들어가므로
**하루 약 99회**가 물리적 상한이다. 캐시가 있으면 같은 검색어는 7일간 쿼터를 쓰지 않는다.

한 번 검색하면 **최대 50개**를 받는다. `search.list` 는 몇 개를 요청하든 100 units 라
50(API 상한)보다 적게 요청할 이유가 없다.

그보다 더 보려면 "더 보기"를 누른다. 페이지마다 **101 units 가 추가로** 들기 때문에
자동 무한 스크롤로 만들지 않았다 — 스크롤만으로 쿼터가 녹으면 하루치가 금방 사라진다.
한 검색어당 최대 4페이지(`MAX_PAGES`, `src/lib/videoSearch.ts`)까지만 받는다. 이 상한이
없으면 `?pages=999` 하나로 하루치가 날아간다.

받아 둔 페이지는 캐시에 함께 쌓인다. 누군가 2페이지까지 펼쳐 두면 그 뒤에 같은 검색어로
들어온 사람은 쿼터를 쓰지 않고 그만큼을 본다.

캐시에 없는 검색어는 `/?q=<아무거나>` 로 누구나 만들 수 있다. 그래서 앱은 스스로
**하루 80회 호출**(`DAILY_CALL_LIMIT`, `src/lib/apiBudget.ts`)에서 멈춘다. "더 보기" 한 번도
검색 한 번과 똑같이 1회로 센다. 상한에 닿으면 실제 쿼터가 0이 되기 전에 캐시 전용 모드로
전환되어, 이미 찾아둔 운동은 계속 볼 수 있고 검색 화면에는 한도 배너가 뜬다.

Supabase가 설정돼 있으면 카운터가 인스턴스 간에 공유된다(`consume_api_budget` RPC).
없으면 프로세스 내 카운터로 동작하므로 인스턴스가 여러 개면 상한이 그만큼 곱해진다.

`npm run seed` 는 45건을 쓰므로 처음 실행한 날에는 사용자 몫이 35회로 줄어든다.
캐시가 7일이라 다음 실행부터는 전부 캐시 적중이라 예산을 쓰지 않는다.

## 마이그레이션

Supabase를 쓴다면 SQL Editor에서 순서대로 실행한다.

| 파일 | 내용 |
|---|---|
| `0001_search_cache.sql` | 검색 캐시 테이블 |
| `0002_api_budget_and_cache_hygiene.sql` | 일일 호출 예산 + 캐시 키 길이 제약·만료 정리 |
| `0003_profiles.sql` | 사용자 프로필과 역할(role) + 가입 트리거 + RLS |
| `0004_routines_and_workouts.sql` | 루틴·운동 기록 표 + RLS (로그인 사용자의 동기화) |
| `0005_routines_keep_newer.sql` | 서버 행보다 오래된 루틴 수정을 건너뛰는 트리거 (기기 사이 덮어쓰기 방지) |

`0002` 를 실행하지 않아도 앱은 동작한다 — 예산 카운터가 메모리로 폴백하고 경고만 남는다.
다만 인스턴스 간 공유가 되지 않으므로 배포 환경에서는 실행하는 편이 좋다.

`0003` 은 로그인을 쓸 때만 필요하다. 실행하지 않으면 로그인한 사용자의 프로필이
생성되지 않고, 앱은 그 사용자를 일반 사용자(`role: 'user'`)로 취급한다.

`0004`·`0005` 도 로그인을 쓸 때만 필요하다. 없으면 동기화가 실패로 표시될 뿐 루틴과 기록은 이 브라우저에서
그대로 동작한다. 실행한 뒤 `npm run sync:check` 로 확인한다.

만료된 캐시 행 정리는 `select public.prune_search_cache();` 로 돌린다.
pg_cron이 있으면 주 1회 스케줄에 걸어 둔다.

## 로그인

구글 OAuth 하나만 지원한다. 로그인은 **선택**이다 — 비로그인 상태로도 검색·재생·루틴이
전부 동작한다. 로그인하면 루틴과 운동 기록(루틴 완료 기록)이 계정에 동기화되어 다른 브라우저·기기에서
이어진다. Supabase 가 설정돼 있지 않으면 동기화는 아무것도 하지 않는다 (`SyncController`, 루트 레이아웃).

진입점은 탭바의 **설정**(`/account`)이다. 처음에는 동기화가 붙을 때까지 숨겨 둘 생각이었지만,
그러면 로그인 자체를 할 방법이 없어서 바로 노출한다.

### 설정

1. Supabase 프로젝트를 만들고 마이그레이션 `0001`~`0005` 를 실행한다.
2. Google Cloud Console → OAuth 동의 화면 + 웹 애플리케이션 클라이언트 ID/시크릿 발급.
3. Supabase 대시보드 → Authentication → Providers → Google 에 ID/시크릿 입력.
4. Google 쪽 "승인된 리디렉션 URI" 에 Supabase 콜백
   (`https://<project>.supabase.co/auth/v1/callback`) 등록.
5. Supabase → Authentication → URL Configuration → Site URL 에 `http://localhost:3000`,
   Redirect URLs 에 `http://localhost:3000/**` 와 배포 도메인을 추가.
6. `.env.local` 에 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` 를 넣는다.
7. `npm run auth:check` 로 설정이 섰는지 확인한다.

콘솔을 오가며 하나씩 체크할 수 있게 `docs/login-setup.html` 에 같은 내용을 19단계
체크리스트로 만들어 뒀다. 브라우저로 그 파일을 바로 열면 된다 (서버 불필요).
체크 상태는 브라우저에 남으므로 끊어서 해도 된다.

비워두면 로그인 버튼이 비활성이고 이유가 화면에 뜬다. 나머지 앱은 정상 동작한다.

`auth:check` 는 브라우저를 열기 전에 걸러지는 것들을 본다 — 마이그레이션 `0003` 미실행,
anon 키 오타, URL 오타, 그리고 **RLS 가 열려 있어 로그인하지 않은 사람에게 남의 프로필이
보이는 상태**. 실제 구글 OAuth 왕복은 이 스크립트로 확인할 수 없다 (아래 수동 확인).

### 관리자

승격 UI 는 만들지 않았다. 관리자가 한둘인 규모에서 승격 화면은 권한 상승 취약점
표면만 만든다. Supabase 콘솔에서 직접 바꾼다.

```sql
update public.profiles set role = 'admin' where id = '<uuid>';
```

### 수동 확인이 필요한 부분

**실제 구글 OAuth 왕복은 CI 에서 검증할 수 없다.** 진짜 구글 계정과 동의 화면이
필요하기 때문이다. "테스트가 다 통과했다"가 그 왕복까지 검증했다는 뜻이 아니다.
자동 테스트가 덮는 것은 비로그인 화면, 실패 안내, 콜백이 외부 주소로 보내지 않는지까지다.

배포 전에 손으로 확인한다.

1. `/account` 에서 `구글로 로그인` 버튼이 **활성**이다 (비활성이면 `.env.local` 을 다시 본다)
2. 누르면 구글 동의 화면이 뜨고, 동의하면 `/account` 로 돌아와 이메일이 보인다
3. 개발자도구 → Application → Cookies 에 `sb-` 로 시작하는 쿠키가 있다
4. 새로고침해도 로그인이 유지된다
5. 구글 동의 화면에서 **취소**하면 `/account` 로 돌아와 안내가 뜨고 앱은 정상이다
6. Supabase 콘솔 → Table Editor → `profiles` 에 방금 가입한 행이 있다
   (없으면 `0003` 마이그레이션을 실행하지 않은 것이다)
7. `로그아웃` 을 누르면 아직 못 보낸 변경을 먼저 올린 뒤(최대 3초) 로그아웃되고, 그 계정에서 받은
   루틴이 이 브라우저에서 **사라진다**. 다시 로그인하면 돌아온다. 비로그인 때 만든 루틴이 계정으로
   옮겨지지 않은 채 남아 있지 않은지도 본다
8. 세션 갱신: Supabase 콘솔에서 JWT 만료를 짧게(예: 60초) 바꾸고 그 시간이 지난 뒤
   새로고침했을 때 로그인이 유지되는지 본다. 끝나면 원래 값으로 되돌린다.
   유지되지 않으면 `proxy.ts` 의 `matcher` 가 그 경로를 제외하고 있는지 의심한다

### 루틴 동기화 수동 확인

루틴 동기화는 실제 로그인 두 개와 브라우저 두 개가 있어야 확인되므로 자동 테스트가 덮지 못한다.
`npm run sync:check` 는 표와 RLS 까지만 본다. 같은 계정으로 브라우저 두 개(A, B)를 열어 확인한다.

1. 마이그레이션 `0004`·`0005` 를 실행한 뒤 `npm run sync:check` 가 `성공` 을 출력한다
2. A 에서 루틴에 운동을 담고, 지우고, 되돌리기를 한다. B 로 포커스를 옮기면 같은 상태가 보인다
3. 로그인하지 않은 채 루틴을 만들어 둔 상태로 로그인하면 가져오기 질문이 뜬다. 가져오면 B 에도 보인다
4. `로그아웃` 하면 루틴이 사라지고, 다시 로그인하면 돌아온다 (위 수동 확인 7번과 같은 동작)
5. A 에서 루틴을 끝까지 재생하고 `운동 완료` 를 누르면, 그 기록이 B 의 `/routines` 에 보인다
6. 개발자도구 → Network 를 오프라인으로 두고 운동을 담으면 "아직 계정에 저장되지 않았어요" 가
   뜬다. 온라인으로 돌아오면 사라진다
7. 휴식 타이머: `/routines` 에서 운동마다 휴식 시간을 정하고(30초·1분·1분30초 프리셋, ±10초,
   10초~5분) 재생 중 `휴식 시작` 을 누른다. **실제 휴대폰에서 20초 동안 다른 앱으로 갔다 와도**
   남은 시간이 맞다 (자동화 브라우저로는 백그라운드 스로틀링을 재현할 수 없다)
8. 루틴 하나를 지운 뒤 30초 넘게 기다렸다가 다른 탭으로 갔다 오거나 앱을 다시 연다. 상태 줄이
   "아직 계정에 저장되지 않았어요" 로 바뀌지 않는다 (지운 루틴이 계속 다시 올라가거나 거절 상태로
   남지 않는다)
9. 개발자도구 → Network 를 오프라인으로 두고 루틴을 고친 뒤 `/account` 에서 `로그아웃` 을 누르면
   "아직 저장되지 않은 변경이 있어요…" 확인이 뜬다. `취소` 는 로그인 상태를 유지하고,
   `그래도 로그아웃` 만 로그아웃한다
10. 덮어쓰기 방지(`0005`): A 를 오프라인으로 두고 루틴 이름을 "A" 로 고친다. B 에서 같은 루틴 이름을
    "B" 로 고친 뒤 A 를 온라인으로 되돌린다. 1분쯤 기다렸다가 A 를 다른 탭으로 옮겼다 돌아오면
    A 도 "B" 를 보여 준다 (A 의 오래된 수정이 서버를 덮어쓰지 않는다)

## 배포

Vercel에 GitHub 저장소를 연결하고 환경변수 `YOUTUBE_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` 를 등록한다. `YOUTUBE_API_BASE` 는 설정하지 않는다 (테스트 전용).
