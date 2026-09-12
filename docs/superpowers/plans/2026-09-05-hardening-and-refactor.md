# 보안 · 성능 · 구조 정비 계획

작성일: 2026-09-05
대상: `health-youtube-video` 전체

## 기준선 (실측)

| 항목 | 결과 |
|---|---|
| `npx tsc --noEmit` | 에러 0 |
| `npm run lint` | 경고 0 |
| `npm test` | 11 파일 / 105 테스트 통과 |
| `npm run build` | 성공. `/`, `/feed`, `/api/videos` 동적, `/routines`, `/_not-found` 정적 |
| `grep -rl "YOUTUBE_API_KEY\|SUPABASE_SERVICE_ROLE" .next/static` | 결과 없음 — 비밀값이 클라이언트 번들에 없다 |

소스는 `src/` 51파일 약 3,000줄. 주석 품질이 높고 "왜"가 적혀 있어서, 아래 항목 중 상당수는
이미 코드나 문서에 근거가 남아 있는 것들이다. 이 계획은 **없는 것을 만드는 것이 아니라
알면서 미뤄둔 것과 측정으로 드러난 것**을 다룬다.

---

## 1. 발견 사항

심각도는 "지금 배포된 상태에서 실제로 무슨 일이 일어나는가"를 기준으로 매겼다.

### 🔴 S1. `/api/videos` — 인증도 제한도 없는 쿼터 소각 엔드포인트

`src/app/api/videos/route.ts`. 파일 첫 줄이 "다음 단계를 위해 미리 열어 둔 공개
엔드포인트, 현재 src 안 어디에서도 호출하지 않는다"라고 스스로 밝히고 있다.
`grep` 으로 확인한 결과 참조하는 곳은 자기 자신의 단위 테스트뿐이다.

실제 피해 경로:

1. 캐시 미스 검색 1회 = `search.list` 100 + `videos.list` 1 = **101 units**
2. YouTube Data API 일일 무료 쿼터 = 10,000 units → **하루 약 99회**
3. 누구든 `curl "https://<도메인>/api/videos?q=$RANDOM"` 을 100번 돌리면
   **그날 서비스 전체의 검색이 죽는다.** 무작위 검색어라 stale 캐시도 없어
   사용자에게는 빈 화면만 남는다.
4. 부수 효과로 Supabase `search_cache` 에 임의 문자열을 PK 로 하는 행이 무제한 쌓인다.

인증·레이트리밋·검색어 검증이 하나도 없다. `q` 길이 제한도 없다.

### 🔴 S2. `/?q=` 페이지도 같은 벡터다

S1의 라우트를 지워도 끝이 아니다. `src/app/(tabs)/page.tsx` 의 서버 컴포넌트가
`searchParams.q` 를 그대로 `getVideos()` 에 넘긴다. `GET /?q=<무작위>` 로 동일하게 태울 수 있다.
방어는 라우트가 아니라 **`getVideos` 진입점**에 있어야 한다.

### 🟠 P1. Supabase 장애 시 검색이 10초 이상 걸린다 — 이미 문서화된 미해결 결함

`README.md` "알려진 문제" 절과
`docs/superpowers/plans/2026-07-25-phase1-exercise-shorts.md` 의 "미뤄둔 결함" 절에
원인과 해법까지 다 적혀 있는데 아직 안 고쳐졌다. Supabase 를 붙이는 순간 노출된다.

핵심은 그 문서가 이미 밝혀낸 사실이다 — **`searchCache.ts` 의 `catch` 블록은 Supabase 실패에
도달하지 않는다.** postgrest-js 는 `.throwOnError()` 없이는 전송 실패까지 전부
`{ data: null, error }` 로 *resolve* 한다. 그러므로 타임아웃을 `catch` 에 기대어 구현하면
동작하지 않는다. 프로미스 자체를 `Promise.race` 로 감싸야 한다.

또 하나: Supabase 가 설정돼 있으면 `getClient()` 가 클라이언트를 반환하므로
**장애 중에 메모리 폴백이 아예 동작하지 않는다.** 캐시도 없고 매 요청이 느리다.

### 🟠 P2. Supabase 클라이언트를 호출마다 새로 만든다

`src/lib/searchCache.ts:13` `getClient()` 가 `readCache` / `writeCache` 마다
`createClient()` 를 호출한다. 검색 1회에 최소 2개, 쿼터 폴백 경로에서는 3개.

### 🟠 P3. 캐시 스탬피드

같은 검색어로 동시에 N개 요청이 오면 전부 캐시 미스로 판정되어 N × 101 units 를 쓴다.
`getVideos` 에 in-flight 합류(coalescing)가 없다.

### 🟠 C1. 루틴 삭제에 확인이 없다 — 되돌릴 수 없는 데이터 손실

`src/components/RoutineList.tsx:211`. 클릭 한 번에 `deleteRoutine(routine.id)` 이 즉시 실행된다.
확인도 실행 취소도 없고, 저장 위치가 localStorage 뿐이라 **복구 경로가 물리적으로 없다.**
"루틴 시작" 버튼 바로 옆에 같은 크기로 붙어 있어 오클릭 거리도 가깝다.

### 🟡 S3. 보안 헤더가 하나도 없다

`next.config.ts` 에 `headers()` 가 없다. CSP, `X-Content-Type-Options`,
`Referrer-Policy`, `Permissions-Policy`, `frame-ancestors` 전부 미설정.
미들웨어(Next 16 에서는 `proxy.ts`)도 없다.

### 🟡 S4. `search_cache` 테이블이 무한히 자란다

TTL 은 `isCacheFresh()` 가 **읽기 시점에만** 판정한다. 만료된 행을 지우는 코드가 없다.
`query_key` 에 길이 제약도 없어서 S1/S2 로 심어진 쓰레기 행이 영구히 남는다.

### 🟡 P4. `next/image` 로 YouTube 썸네일을 재최적화한다

`i.ytimg.com/vi/<id>/hqdefault.jpg` 는 이미 최적화된 고정 크기 JPEG 다.
그리드 카드 25장 × 검색마다 Vercel 이미지 변환이 돈다 — 지연과 과금이 둘 다 늘어난다.
YouTube 는 `default`/`mqdefault`/`hqdefault`/`maxresdefault` 로 자체 해상도 변형을 제공한다.

### 🟡 P5. `/` 가 항상 동적 렌더다

트래픽의 대부분은 부위 칩 25개(상위 7 + 세부 18)와 인기 운동 20개, 총 **45개의 고정 검색어**다.
`scripts/seed-cache.ts` 가 정확히 이 45개를 시드한다. 즉 사실상 정적인데도 매 요청마다
서버 렌더 + Supabase 왕복을 한다.

Next 16 은 `cacheComponents: true` + `use cache` / `cacheLife` 를 제공한다
(`node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-cache.md`).

### 🟡 A1. 디렉터리가 타입별이라 기능 경계가 안 보인다

`src/components/` 에 22개 파일이 평평하게 있고 검색·피드·루틴·인체도·네비게이션이 섞여 있다.
`src/lib/` 도 마찬가지로 도메인 유틸(`youtube`, `routines`)과 범용 유틸(`duration`)이 같은 층에 있다.
파일 이름으로만 소속을 짐작해야 한다.

### 🟡 A2. 디자인 프리미티브가 버튼 2개에서 멈췄고, 이미 표류 중이다

`src/components/styles.ts` 는 `BUTTON_PRIMARY` / `BUTTON_SECONDARY` 만 공유한다.
그 파일의 주석이 "복붙해두면 한쪽만 고쳐지면서 금방 서로 어긋난다"고 적어놨는데,
정작 다음 것들이 각자 클래스 문자열을 들고 있다:

| 요소 | 위치 | 현재 값 |
|---|---|---|
| 아이콘 버튼 | `RoutineList.tsx:240` (`IconButton`) | `h-7 w-7 rounded-lg` |
| 아이콘 버튼 | `AddToRoutineButton.tsx:71` | `h-8 w-8 rounded-full` |
| 아이콘 버튼 | `ShortsFeed.tsx:266` (`FeedNavButton`) | `h-11 w-11 rounded-full` |
| 아이콘 버튼 | `ShortsFeed.tsx:216` (닫기) | `h-7 w-7 rounded-full` |
| 아이콘 버튼 | `SearchBar.tsx:56` (지우기) | `h-7 w-7 rounded-full` |
| 아이콘 버튼 | `BackButton.tsx:19` | `h-10 w-10 rounded-full` |
| 칩 | `CategoryChips.tsx:88` | `h-9 px-4` / `h-8 px-3.5` |
| 칩 | `SuggestPanel.tsx:26` | `h-10 px-4 rounded-xl` |
| 칩 | `EmptyState.tsx:25` | `h-9 px-3.5 rounded-full` |
| 카드 | 4곳 | `rounded-2xl border border-border` (배경만 제각각) |

여섯 종류의 아이콘 버튼과 세 종류의 칩이 hover 규칙도 서로 다르다.
경고했던 표류가 실제로 일어난 상태다.

### 🟢 C2. localStorage 쓰기 실패가 조용히 삼켜진다

`src/lib/routines.ts:86` — `setItem` 이 던지면 `catch {}` 로 무시한다.
화면에는 이미 담긴 것처럼 보이는데 새로고침하면 사라진다. 사용자는 이유를 알 수 없다.

### 🟢 C3. 루틴 이름 편집 상태가 외부 변경과 어긋난다

`RoutineList.tsx:75` `useState(routine.name)` 이 초기값으로만 쓰인다.
다른 탭에서 이름을 바꾸면 이 탭의 입력창은 옛 이름을 들고 있고, 저장하면 되돌려버린다.
`SearchBar.tsx:18` 이 이미 "렌더 중 동기화" 패턴으로 같은 문제를 풀어놨는데 여기엔 적용이 안 됐다.

### 🟢 A3. `parent` 가 함수 경계에서 `string` 으로 넓어진다

`src/data/categories.ts:56` `subgroupsOf(parentId: string)`.
`MUSCLE_GROUPS` 의 `parent` 는 리터럴 타입이지만 이 경계를 넘으면 오타가 컴파일에 안 걸린다.
`BodyModelPicker.tsx:25` 의 `MUSCLE_GROUPS.map(g => [g.id as string, g])` 도 같은 이유로 캐스팅이 붙어 있다.

### 🟢 T1. 컴포넌트 테스트가 0개, CI 도 없다

- `vitest.config.ts` 의 `environment: 'node'` — 단위 테스트 105개는 전부 순수 함수다.
- 가장 복잡한 `BodyModelPicker`(455줄)는 WebGL 이라 어느 쪽에서도 안 덮인다. 이건 어쩔 수 없다.
- 반면 `useVideoEnded`(84줄)는 **origin 검증이 들어 있는 보안 경계**인데 미검증이다.
  `event.origin !== 'https://www.youtube.com'` 이 실수로 지워져도 아무 테스트가 안 깨진다.
  jsdom 환경이면 순수 로직으로 테스트할 수 있다.
- `.github/` 가 없다. lint / tsc / test 가 로컬에서만 돈다.

### 🟢 P6. Geist Mono 를 `.tabular` 하나 때문에 전역 로드

`.tabular` 가 쓰이는 곳은 재생시간·개수·인덱스 총 7군데다.
Pretendard 도 `font-variant-numeric: tabular-nums` 를 지원한다.
시각적 차이가 없다면 의존성 하나와 폰트 요청을 줄일 수 있다. **측정 후에만** 결정한다.

### 🟢 P7. `AddToRoutineButton` 이 카드마다 스토어를 구독

그리드 25장 = `useSyncExternalStore` 구독 25개. 루틴 하나가 바뀌면 25개가 전부 리렌더된다.
`loadRoutines()` 가 `cachedRaw` 로 JSON.parse 를 막고 있어 실제로는 가벼울 가능성이 높다.
**프로파일링으로 실제 비용을 확인하기 전에는 손대지 않는다.**

---

## 2. 실행 계획

각 단계는 독립적으로 배포 가능하다. 단계마다 `tsc` + `lint` + `npm test` + `npm run test:e2e` 가
통과해야 다음으로 넘어간다.

---

### 단계 1 — 쿼터 방어 (최우선)

지금 배포돼 있다면 누구든 하루치 서비스를 100번의 요청으로 끌 수 있다. 다른 무엇보다 먼저다.

**1a. `/api/videos` 삭제**

`src/app/api/videos/route.ts` 와 `tests/unit/videosRoute.test.ts` 를 지운다.

사용처가 없고, 존재 이유("나중에 네이티브 앱")는 그때 인증과 함께 설계하면 된다.
지금은 순수하게 공격 표면일 뿐이다. 되살릴 때 참고하도록 커밋 메시지에 이유를 남긴다.

**1b. 검색어 검증을 `getVideos` 진입점에 둔다**

`src/lib/videoSearch.ts` 가 유일한 관문이므로 여기서 막는다.

- 정규화 후 길이 상한 (`MAX_QUERY_LENGTH = 40`). 한글 운동 이름 중 가장 긴 것이
  `'트라이셉스익스텐션'`(9자), 칩 쿼리 최장이 `'전면 삼각근 운동'`(9자)이라 40은 충분히 넉넉하다.
- 상한 초과는 예외가 아니라 빈 결과로 흡수한다 — 에러 화면을 띄우면 그것도 렌더 비용이다.
- 제어문자 제거.

**1c. 일일 호출 예산 카운터**

레이트리밋만으로는 분산된 요청을 막지 못한다. 실제 안전장치는 **YouTube 를 부른 횟수를 세는 것**이다.

- Supabase 에 `api_budget(day date primary key, calls int)` 테이블을 만든다.
- `searchShorts` 를 부르기 직전에 원자적으로 증가시키고, 상한(예: 하루 80회 — 10,000 의 80%)에
  닿으면 `QuotaExceededError` 를 던진다.
- 기존 쿼터 폴백 경로가 그대로 재사용된다: stale 캐시를 주고 `QuotaBanner` 를 띄운다.
  **새 UI 를 만들 필요가 없다.** 실제 쿼터가 0이 되기 전에 앱이 스스로 멈춘다.
- Supabase 가 없으면 프로세스 내 카운터로 폴백한다 (완벽하지 않지만 개발 환경에는 충분).

**1d. `proxy.ts` 로 IP 레이트리밋** *(선택 — Vercel 배포 시)*

Next 16 은 `middleware.ts` 를 폐기하고 `proxy.ts` 로 이름을 바꿨다
(`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`).
프로젝트 루트 또는 `src/` 에 둔다.

문서가 명시하듯 proxy 는 CDN 에 배포될 수 있어 **공유 모듈이나 전역에 의존하면 안 된다.**
따라서 인메모리 카운터는 부적절하다. Vercel 배포라면 `@vercel/firewall` 또는 Upstash 같은
외부 스토어가 필요하다. 1c 가 실질적 방어를 이미 제공하므로 이 항목은 후순위다.

**검증**

- `q` 가 41자 이상이면 YouTube 를 부르지 않는다 (단위 테스트).
- 예산 상한에 닿으면 `quotaExceeded: true` + stale 캐시가 나온다 (단위 테스트).
- `/api/videos` 가 404 다.
- 기존 E2E 10개가 전부 그대로 통과한다.

---

### 단계 2 — 캐시 계층 신뢰성

**2a. Supabase 클라이언트 싱글턴화** (P2)

모듈 레벨 lazy memo 로 바꾼다. 환경변수가 런타임에 바뀌지 않는다는 전제는 이미 성립한다.

**2b. 타임아웃 + 메모리 폴백** (P1)

계획 문서가 제시한 방향 그대로 구현한다.

1. Supabase 호출을 `Promise.race([call, timeout(2000)])` 로 감싼다.
   **`catch` 에 기대면 동작하지 않는다** — postgrest-js 는 실패를 resolve 하기 때문이다.
2. 타임아웃 또는 오류가 나면 메모리 캐시로 강등한다. 장애 중에도 캐싱이 살아 있게 한다.
3. 버린 프로미스에 `.catch(() => {})` 를 붙여 unhandled rejection 을 막는다.

핵심 설계 변경: 지금은 `getClient()` 가 non-null 이면 메모리 캐시를 **아예 쓰지 않는다.**
이걸 "Supabase 우선, 실패하면 메모리" 2계층으로 바꾼다.

**2c. 인플라이트 합류** (P3)

`getVideos` 에 `Map<string, Promise<VideoSearchResult>>` 를 두고, 같은 정규화 키의 진행 중
요청에 합류시킨다. 완료 시 반드시 삭제한다 (성공·실패 모두).

**2d. `search_cache` 위생** (S4)

`supabase/migrations/0002_search_cache_hygiene.sql`:

```sql
alter table public.search_cache
  add constraint search_cache_key_length check (length(query_key) <= 64);

create index if not exists search_cache_created_at_idx
  on public.search_cache (created_at);

-- 만료 행 정리. pg_cron 이 있으면 주 1회 스케줄, 없으면 수동 실행.
delete from public.search_cache where created_at < now() - interval '14 days';
```

TTL 이 7일이므로 14일이면 stale 폴백 여지를 남기면서도 무한 증식을 막는다.

**검증**: MSW 로 Supabase 응답을 2초 이상 지연시켰을 때 `readCache` 가 2초 안에 반환하고
메모리 캐시로 떨어지는지 단위 테스트. 동일 쿼리 동시 10건이 `searchShorts` 를 1회만 부르는지 테스트.

---

### 단계 3 — 보안 헤더

`next.config.ts` 에 `headers()` 를 추가한다.

```
Content-Security-Policy         (아래 참고)
X-Content-Type-Options          nosniff
Referrer-Policy                 strict-origin-when-cross-origin
Permissions-Policy              camera=(), microphone=(), geolocation=(), interest-cohort=()
```

CSP 는 이 앱의 실제 의존성만 허용하면 된다:

```
default-src 'self';
img-src     'self' https://i.ytimg.com data:;
frame-src   https://www.youtube.com https://www.youtube-nocookie.com;
font-src    'self';
style-src   'self' 'unsafe-inline';
frame-ancestors 'none';
```

`script-src` 가 문제다. Next 는 하이드레이션에 인라인 스크립트를 쓴다. nonce 를 쓰려면
`proxy.ts` 에서 요청마다 생성해 넘겨야 하고, 그러면 모든 페이지가 동적이 되어 단계 5(캐싱)와 충돌한다.

**따라서 순서를 지킨다**: 먼저 `Content-Security-Policy-Report-Only` 로 배포해
실제로 무엇이 걸리는지 본다. 위반이 정리된 뒤에만 강제 모드로 올린다.
`frame-ancestors 'none'` 은 부작용이 없으니 처음부터 강제해도 된다.

`useVideoEnded` 의 `postMessage(..., '*')` 는 그대로 둔다. 코드 주석이 근거를 정확히 적어놨고
(임베드가 두 도메인 중 어디로도 갈 수 있고 내보내는 내용이 비밀이 아니다),
실제 방어는 수신 측 origin 검증이다. 그 검증에 테스트를 붙이는 것이 단계 6의 일이다.

---

### 단계 4 — 데이터 손실 방지 (C1, C2, C3)

**4a. 루틴 삭제에 되돌릴 길을 준다**

확인 대화상자보다 **실행 취소 토스트**가 낫다. 확인창은 매번 마찰을 주고, 사람들은 곧
읽지 않고 누른다. 실행 취소는 실수했을 때만 개입한다.

- 삭제 시 루틴 객체를 메모리에 들고 있다가 5초짜리 "'가슴 루틴' 을 삭제했어요 [실행 취소]" 를 띄운다.
- 5초 뒤 또는 페이지 이탈 시 확정.
- 토스트가 필요한 곳은 지금 여기 하나뿐이므로 라이브러리를 넣지 않는다.
  `RoutineList` 안의 지역 상태로 충분하다.

**4b. `commit` 이 실패를 알린다** (C2)

`routines.ts` 의 `commit()` 이 `boolean` 을 반환하게 하고, 실패 시 호출부가
"저장 공간이 가득 찼어요" 를 띄운다. 조용한 실패보다 훨씬 낫다.

**4c. 이름 편집 동기화** (C3)

`SearchBar.tsx:18` 의 렌더 중 동기화 패턴을 `RoutineCard` 에 그대로 적용한다.
같은 문제를 같은 방식으로 푸는 것이 패턴 통일의 실질이다.

---

### 단계 5 — 성능

**5a. 썸네일 최적화 우회** (P4)

`ShortVideo.thumbnailUrl` 이 항상 `i.ytimg.com/vi/<id>/<name>.jpg` 형태라는 점을 이용한다.
`next.config.ts` 에 커스텀 `images.loader` 를 두거나, 썸네일에 한해 `unoptimized` 를 준다.
전자가 낫다 — YouTube 자체 변형(`mqdefault` 320px / `hqdefault` 480px / `maxresdefault` 1280px)으로
`srcSet` 을 만들면 반응형이 유지된다.

**측정**: 변경 전후로 검색 결과 화면의 LCP 와 총 전송량을 비교한다. 개선이 없으면 되돌린다.

**5b. 고정 검색어 캐싱** (P5)

`next.config.ts` 에 `cacheComponents: true` 를 켜고 `getVideos` 를 `use cache` + `cacheLife` 로 감싼다.

주의점: `use cache` 문서가 명시하듯 **쿠키/헤더는 캐시 스코프 밖에서 읽어 인자로 넘겨야 한다.**
`getVideos` 는 이미 `query` 하나만 받는 순수한 형태라 잘 맞는다.
`cacheLife` 는 기존 `CACHE_TTL_MS`(7일)와 맞춘다.

이건 단계 3의 CSP nonce 와 상충할 수 있으므로 **단계 3의 Report-Only 관찰이 끝난 뒤** 진행한다.

**5c. Geist Mono 제거 검토** (P6)

`.tabular` 를 `font-family: var(--font-mono)` 없이 `font-variant-numeric: tabular-nums` 만으로 두고
7군데를 육안 비교한다. 차이가 없으면 `geist` 의존성과 `GeistMono.variable` 을 걷어낸다.
차이가 있으면 그대로 둔다 — 숫자 폭이 흔들리는 것은 실제 결함이다.

**5d. P7 은 하지 않는다**

`AddToRoutineButton` 의 구독 25개는 **프로파일링으로 실제 비용이 확인되기 전에는 손대지 않는다.**
`cachedRaw` 가 JSON.parse 를 이미 막고 있어 측정 없이 고치면 근거 없는 복잡도만 는다.

---

### 단계 6 — 테스트와 CI

**6a. `useVideoEnded` 테스트** (T1)

`vitest.config.ts` 에 jsdom 환경 프로젝트를 추가하거나, 파일 상단 `@vitest-environment jsdom` 을 쓴다.
덮어야 할 것:

- `event.origin` 이 `https://www.youtube.com` 이 아니면 무시한다 ← **보안 경계**
- `payload.id` 가 자기 플레이어가 아니면 무시한다
- `playerState === 0` 일 때만 `onEnded` 를 부른다
- 응답이 오면 핸드셰이크를 멈춘다 / 12회 후 포기한다
- 언마운트 시 리스너와 타이머를 정리한다

**6b. CI 워크플로**

`.github/workflows/ci.yml` — `npm ci` → `lint` → `tsc --noEmit` → `test` → `playwright test`.
Playwright 는 자체 모의 서버를 띄우므로 API 키나 네트워크가 필요 없다.

---

### 단계 7 — 구조와 디자인 패턴 통일

> **이 단계는 순수 정리다. 동작을 바꾸지 않는다.**
> 성공 기준은 "테스트와 화면이 전과 완전히 동일하다"이다.

**7a. 기능별 디렉터리** (A1)

```
src/
  features/
    search/     SearchBar SearchHeader CategoryChips VideoGrid ResultToolbar
                EmptyState SuggestPanel QuotaBanner lengthFilter.ts searchParams.ts
    feed/       ShortsFeed FeedSlide feedPlayerBox.ts embed.ts useVideoEnded.ts BackButton
    routines/   RoutineList RoutineFeed AddToRoutineButton routines.ts useRoutines.ts
    body/       BodyPanel BodyModelPicker categories.ts bodyModelNodes.json
  components/ui/   Button IconButton Chip Card MessageCard icons.ts
  lib/             youtube.ts searchCache.ts videoSearch.ts cacheKey.ts
                   duration.ts shorts.ts types.ts useHydrated.ts
  app/             (변경 없음)
```

**이동만 하는 커밋 하나**로 처리한다. 로직 변경을 섞으면 diff 에서 회귀를 못 찾는다.

**7b. UI 프리미티브** (A2)

`src/components/ui/` 에 만들고, A2 표의 여섯 종류 아이콘 버튼과 세 종류 칩을 흡수한다.

- `Button` — variant: `primary` / `secondary` / `ghost`, size: `sm` / `md`
- `IconButton` — size: `sm`(28) / `md`(32) / `lg`(44), shape: `circle` / `rounded`, tone: `default` / `danger` / `overlay`
- `Chip` — size: `sm` / `md`, shape: `pill` / `rounded`, active 상태
- `Card` — `rounded-2xl border border-border` + 배경 변형

**현재 픽셀값을 그대로 보존한다.** 여섯 개의 아이콘 버튼 크기를 하나로 통일하고 싶은 유혹이
있지만, 그건 리디자인이고 별개 판단이다. 지금은 **흩어진 값을 한 곳에 모으는 것**까지만 한다.
모아 놓으면 그때 "왜 6종류인가"가 눈에 보이고, 줄일지 말지는 그 다음에 결정한다.

**7c. 타입 좁히기** (A3)

`categories.ts` 의 `parent: BodyPartId`, `subgroupsOf(parentId: BodyPartId)`.
`BodyModelPicker.tsx:25` 의 `as string` 캐스팅이 필요 없어지는지 확인한다.

**7d. `AGENTS.md` 에 규칙을 적는다** (A4)

지금 코드가 따르고 있지만 어디에도 안 적힌 것들:

- 서버 상태는 URL(`searchParams`), 클라이언트 영속 상태는 localStorage + `useSyncExternalStore`.
  `useState` 는 순수 UI 토글에만 쓴다.
- 아이콘은 `components/ui/icons.ts` 를 통해서만 가져온다 (`dist/ssr/<이름>` 경로 유지 이유 포함).
- 새 화면 요소는 `components/ui/` 프리미티브를 먼저 찾는다. 없으면 만들고, 클래스 문자열을 복붙하지 않는다.
- 기능 코드는 `features/<기능>/`, 도메인 무관 유틸만 `lib/`.

---

## 3. 순서와 근거

| 단계 | 내용 | 이유 |
|---|---|---|
| 1 | 쿼터 방어 | 지금 100번의 요청으로 서비스를 끌 수 있다 |
| 2 | 캐시 신뢰성 | Supabase 를 붙이는 순간 앱이 사실상 못 쓰게 된다 |
| 3 | 보안 헤더 (Report-Only) | 관찰 기간이 필요하므로 일찍 시작한다 |
| 4 | 데이터 손실 방지 | 복구 경로가 없는 손실이다 |
| 5 | 성능 | 3의 관찰이 끝나야 5b 를 결정할 수 있다 |
| 6 | 테스트 · CI | 7 의 대규모 이동 전에 안전망을 확보한다 |
| 7 | 구조 정리 | 가장 위험이 낮고 가장 급하지 않다. 마지막 |

7을 마지막에 두는 이유: 파일 이동은 diff 를 통째로 흔들어 놓기 때문에, 그 전에 들어가야 할
실질 수정들이 리베이스 지옥에 빠진다. 6의 CI 가 먼저 서야 이동이 안전하다.

## 4. 하지 않기로 한 것

- **P7 (구독 최적화)** — 측정 없는 최적화. 프로파일이 문제를 보이면 그때 한다.
- **아이콘 버튼 6종류를 1~2종류로 통일** — 리팩터링이 아니라 리디자인이다. 7b 로 값을 모은 뒤 별도로 판단한다.
- **`/api/videos` 를 인증과 함께 살리기** — 소비자가 없다. 필요해질 때 요구사항을 알고 설계하는 편이 낫다.
- **`BodyModelPicker` 단위 테스트** — WebGL 은 jsdom 에서 의미 있게 못 돈다. E2E 육안 확인을 유지한다.
- **에러 추적/모니터링 도입** — 유용하지만 이 계획의 범위 밖이고, 별도 결정이 필요하다.
