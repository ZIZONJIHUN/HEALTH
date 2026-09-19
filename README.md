# 헬스 쇼츠

운동 이름을 검색하면 관련 쇼츠를 웹 내부에서 바로 재생하는 서비스.

설계 문서: `docs/superpowers/specs/2026-07-25-health-shorts-gymwear-design.md`

## 준비

1. `npm install`
2. `.env.local.example` 을 `.env.local` 로 복사한다.
3. [Google Cloud Console](https://console.cloud.google.com/)에서 YouTube Data API v3를 켜고 API 키를 발급해 `YOUTUBE_API_KEY` 에 넣는다.

이 세 단계만으로 앱은 완전히 동작한다. `SUPABASE_*` 는 선택 사항이다.

### Supabase는 선택이다

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` 를 비워두면 검색 캐시가 프로세스 내부 메모리로
폴백한다 (`src/lib/searchCache.ts`). 같은 프로세스가 살아있는 동안은 같은 검색어를 반복해도
쿼터를 쓰지 않는다. 다만 이 캐시는 프로세스를 재시작하거나 인스턴스가 여러 개 떠 있으면
공유되지 않는다.

Supabase를 붙이면 캐시가 인스턴스 간, 재시작 간에도 유지된다. 개발 중 쿼터를 아끼거나
여러 사람이 같은 캐시를 공유하려면 다음을 설정한다.

1. Supabase 프로젝트를 만들고 SQL Editor에서 `supabase/migrations/0001_search_cache.sql` 을 실행한다.
2. Supabase 프로젝트 설정에서 URL과 `service_role` 키를 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` 에 넣는다.
3. `npm run cache:check` 로 실제 쓰기→읽기 왕복이 되는지 확인한다. 마이그레이션 미실행,
   `anon` 키를 잘못 넣은 경우, 테이블/컬럼명 오타 등을 여기서 바로 잡아낸다.

`YOUTUBE_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` 는 서버에서만 읽는다. 클라이언트 번들에
포함되지 않으며, `NEXT_PUBLIC_` 접두사를 붙이지 않는다.

## 실행

```bash
npm run dev         # 개발 서버
npm test            # 단위 테스트
npm run test:e2e    # E2E (모의 YouTube 서버를 자동으로 띄운다)
npm run seed        # 인기 운동 20개 캐시 시드 (Supabase 필수 — 없으면 즉시 종료한다)
npm run cache:check # Supabase 캐시 왕복 확인
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

`0002` 를 실행하지 않아도 앱은 동작한다 — 예산 카운터가 메모리로 폴백하고 경고만 남는다.
다만 인스턴스 간 공유가 되지 않으므로 배포 환경에서는 실행하는 편이 좋다.

만료된 캐시 행 정리는 `select public.prune_search_cache();` 로 돌린다.
pg_cron이 있으면 주 1회 스케줄에 걸어 둔다.

## 배포

Vercel에 GitHub 저장소를 연결하고 환경변수 `YOUTUBE_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` 를 등록한다. `YOUTUBE_API_BASE` 는 설정하지 않는다 (테스트 전용).
