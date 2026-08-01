# 헬스 쇼츠

운동 이름을 검색하면 관련 쇼츠를 웹 내부에서 바로 재생하는 서비스.

설계 문서: `docs/superpowers/specs/2026-07-25-health-shorts-gymwear-design.md`

## 준비

1. `.env.local.example` 을 `.env.local` 로 복사한다.
2. [Google Cloud Console](https://console.cloud.google.com/)에서 YouTube Data API v3를 켜고 API 키를 발급해 `YOUTUBE_API_KEY` 에 넣는다.

이 두 단계만으로 앱은 완전히 동작한다. `SUPABASE_*` 는 선택 사항이다.

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
npm run seed        # 인기 운동 20개 캐시 시드
npm run cache:check # Supabase 캐시 왕복 확인
```

E2E는 앱을 3000번이 아닌 **3100번 포트**에서 띄운다. 3000번을 다른 프로세스가 이미 점유하고
있으면 Playwright의 `reuseExistingServer` 가 그 프로세스를 재사용해 엉뚱한 앱을 테스트하는
사고가 있었기 때문이다 (`playwright.config.ts` 참고). E2E 스위트는 자체적으로 모의 YouTube
서버를 띄우므로 `YOUTUBE_API_KEY` 나 네트워크 연결 없이 실행할 수 있다.

## 쿼터 주의

YouTube Data API 일일 무료 쿼터는 10,000 units다. 검색 1회에 101 units가 들어가므로 **하루 약 99회**가 상한이다. 캐시가 있으면 같은 검색어는 7일간 쿼터를 쓰지 않는다.

## 알려진 문제

**Supabase 장애 시 검색이 7초 이상 느려진다.** Supabase를 설정한 상태에서 Supabase가
응답하지 않으면, postgrest-js의 내부 재시도(1초+2초+4초 백오프)가 끝나야 실패로
처리되어 캐시 읽기·쓰기 각각 약 7초가 걸린다. 검색 한 번에 10초 이상이 붙을 수 있다.
Supabase를 설정하지 않은 경우(메모리 폴백만 사용)에는 발생하지 않는다.

원인 분석과 고칠 방향은
`docs/superpowers/plans/2026-07-25-phase1-exercise-shorts.md` 의
"미뤄둔 결함: Supabase 장애 시 검색이 7초 이상 느려진다" 절을 참고한다.

## 배포

Vercel에 GitHub 저장소를 연결하고 환경변수 `YOUTUBE_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` 를 등록한다. `YOUTUBE_API_BASE` 는 설정하지 않는다 (테스트 전용).
