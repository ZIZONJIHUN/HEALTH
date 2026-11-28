<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# 이 저장소의 규칙

코드가 이미 따르고 있지만 어디에도 적혀 있지 않던 것들이다. 적어 두지 않으면
다음 사람이(또는 다음 세션이) 각자 다른 방식을 고른다.

## 어디에 무엇을 두는가

```
src/features/<기능>/   한 기능에만 쓰이는 컴포넌트·훅·데이터를 함께 둔다
src/components/ui/     프리미티브. 여러 기능이 공유하는 것만
src/components/nav/    내비게이션
src/lib/               도메인과 무관한 유틸, 외부 서비스 접근
src/app/               라우팅과 화면 조립만. 로직은 두지 않는다
```

기능 코드는 `features/` 에 둔다. 두 기능이 같은 것을 쓰게 되면 그때 `lib/` 나
`components/ui/` 로 올린다 — 미리 올리지 않는다.

## 상태

- **서버 상태는 URL 에 둔다.** 검색어, 길이 필터, 부위 칩 펼침 상태가 전부 `searchParams`
  에서 유도된다. 컴포넌트 상태로 들면 뒤로가기·새로고침·링크 공유에서 풀린다.
- **영속 상태는 localStorage + `useSyncExternalStore`.** 루틴과 운동 기록이 그렇다. 로컬 저장
  매체를 아는 코드는 `features/routines/routines.ts`, `features/workouts/workouts.ts` 안에만,
  서버(Supabase) 입출력은 `features/routines/routineSync.ts` 안에만 둔다.
- **사용자 데이터에는 service 클라이언트(`src/lib/supabase/service.ts`)를 쓰지 않는다.** RLS 를
  우회하므로 검색 캐시·예산 전용이다. 루틴·기록은 로그인 사용자의 anon 세션으로만 닿는다.
- `useState` 는 순수 UI 토글(열림/닫힘, 편집 중)에만 쓴다.

## 화면

- 새 UI 요소는 `components/ui/` 의 프리미티브를 먼저 찾는다. 없으면 만든다.
  **클래스 문자열을 복붙하지 않는다** — 예전에 아이콘 버튼이 여섯 종류, 칩이 세 종류로
  갈라진 적이 있다.
- 아이콘은 `components/ui/icons.ts` 를 통해서만 가져온다. 최상위 배럴(`@phosphor-icons/react`)
  에는 `'use client'` 가 붙어 있어 서버 컴포넌트에 클라이언트 경계를 만든다.
  굵기는 `ICON_WEIGHT` 하나로 통일한다.
- 색은 `globals.css` 의 토큰만 쓴다. 액센트는 라임 하나뿐이고 두 번째 액센트를 만들지 않는다.

## 쿼터

YouTube 검색 1회는 101 units, 일일 무료 쿼터는 10,000 units다. **하루 약 99회가 상한이다.**

- 새 검색 경로를 만들 때는 반드시 `getVideos()` 를 통한다. 검색어 검증과 일일 호출
  예산이 거기 있다. `searchShorts()` 를 직접 부르면 둘 다 우회된다.
- 사용자 입력이 그대로 YouTube 에 닿는 경로를 새로 열지 않는다. 인증 없는 공개
  엔드포인트를 열었다가 요청 100번으로 하루치가 소각될 수 있던 적이 있다.

## 검증

`npm run lint -- --max-warnings 0`, `npx tsc --noEmit`, `npm test`, `npm run test:e2e`.
CI(`.github/workflows/ci.yml`)가 같은 것을 돌린다. E2E 는 자체 모의 YouTube 서버를
띄우므로 API 키도 네트워크도 필요 없다.
