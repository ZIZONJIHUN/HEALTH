# Taste Skill 기반 UI/UX 리디자인 설계

작성일: 2026-08-08
대상: `헬스 쇼츠` (Next 16 · React 19 · Tailwind v4)
선행 문서: `2026-07-25-health-shorts-gymwear-design.md`

## 배경

기능은 완성됐지만 화면은 스캐폴드 상태다. 상호작용 상태(hover/active/focus)가 전혀 없고,
로딩 상태가 없어 검색 중 화면이 멈춘 것처럼 보이며, PC에서는 `max-w-md` 때문에 가운데
좁은 띠만 보인다.

[Taste Skill](https://www.tasteskill.dev/) 을 프로젝트에 설치하고, 그 중
`redesign-existing-projects` 감사 항목과 `design-taste-frontend` 의 안티슬롭 규칙을 기준으로
전면 리디자인한다.

## Design Read

> 한국 헬스인 대상 모바일 퍼스트 콘텐츠 앱(쇼츠 뷰어). *dark athletic utility* 언어.
> 랜딩페이지가 아니라 **제품 UI**이므로 화려함보다 손맛·속도가 우선.

Taste Skill 다이얼: `DESIGN_VARIANCE 5 / MOTION_INTENSITY 4 / VISUAL_DENSITY 5`.

제품 UI이므로 `design-taste-frontend` 의 랜딩 전용 규칙(히어로 스택, 아이브로우 제한, bento,
GSAP 스크롤 하이재킹)은 적용 대상이 아니다. 적용하는 것은 타이포·컬러·상태·레이아웃 규율과
`redesign-existing-projects` 의 감사 체크리스트다.

## 감사 결과 (고칠 것)

| 영역 | 문제 | 조치 |
|---|---|---|
| 타이포 | 시스템 기본 폰트, 스케일·트래킹 없음, 400/700만 사용 | Pretendard Variable + Geist Mono, 타입 스케일 정의, 400~800 사용 |
| 컬러 | 라임 `#C8FF3D` 채도 100%(형광), danger 채도 100%, 회색 스케일 근거 없음 | 채도 75%로 정제, 쿨 뉴트럴 한 계열로 통일 |
| 상호작용 | hover/active/focus 상태 없음, transition 0ms | 전역 상호작용 레이어 도입 |
| 커서 | Tailwind v4 preflight가 `button { cursor: default }` 로 바꿔 손가락 커서가 안 뜸 | 전역 `cursor: pointer` 규칙 |
| 상태 | 로딩 상태 없음 (검색 = YouTube API 왕복) | `loading.tsx` 스켈레톤 |
| 레이아웃 | `max-w-md` 고정, 그리드 2열 고정, 탭 1개짜리 하단바가 PC에서 무의미 | 반응형 컨테이너·그리드, md+ 상단 헤더 |
| 스크롤 | 브라우저 기본 스크롤바, 칩 가로 스크롤바 노출, 스크롤바 등장 시 레이아웃 흔들림 | 커스텀 스크롤바 + `scrollbar-gutter: stable` + `.scrollbar-none` |
| a11y | skip-to-content 없음, 포커스 링 없음, 카테고리 현재 선택 미표시 | 전부 추가 |

## 1. 타이포그래피

**본문/한글: Pretendard Variable** — 한국어 UI에서 가장 깔끔한 선택지. Google Fonts에 없으므로
자가호스팅한다.

- `public/fonts/pretendard/` 에 dynamic subset woff2 92개 + `@font-face` CSS를 커밋한다.
- 전체 2.82MB지만 `unicode-range` 로 쪼개져 있어 실제 페이지당 필요한 조각(~150KB)만 내려받는다.
  - 대안 비교: full variable 단일 파일 2.06MB(전량 다운로드), static subset 3 weight 806KB.
    dynamic subset이 실사용 바이트에서 유리하고 가변 폰트라 weight 5종을 무료로 쓴다.
- `font-display: swap`, 라틴 조각(subset.0)만 `<link rel="preload">`.

**숫자/메타: Geist Mono** — `next/font/google` (빌드 타임 자가호스팅, 런타임 외부 요청 0).
재생시간 배지, 진행 인디케이터(`3 / 9`) 등 숫자에 `font-variant-numeric: tabular-nums` 와 함께 쓴다.

CSS 변수 `--font-sans`, `--font-mono` 로 노출하고 Tailwind `@theme` 에 연결한다.

**스케일**: 디스플레이는 `tracking-tight` + `leading-[1.15]`, 본문은 `leading-relaxed`.
제목에 `text-wrap: balance`, 본문에 `text-wrap: pretty`.

## 2. 컬러 토큰

다크 모드 단일 테마를 유지한다(Page Theme Lock). 회색은 쿨 뉴트럴 한 계열로만 쓴다.

```
--color-bg            #0A0C0F
--color-surface       #12151A
--color-surface2      #1A1E25
--color-surface3      #222731   (hover)
--color-border        #262C36
--color-border-strong #343B47
--color-text          #EDF0F5
--color-muted         #9AA3B2
--color-dim           #6B7484
--color-accent        #C2E85B   (기존 #C8FF3D, 채도 100% → 75%)
--color-accent-hover  #D2F471
--color-accent-dim    #8FAF3E   (링/보더)
--color-accent-fg     #0A0C0F   (액센트 위 텍스트)
--color-danger        #E8615F   (기존 #FF5A5F)
```

액센트는 라임 하나로 잠근다(Color Consistency Lock). 그림자는 순수 검정 대신 배경 색조를 띤
값을 쓴다. `z-index` 는 토큰(`--z-nav 40`, `--z-overlay 50`)으로만 쓰고 `9999` 같은 임의값을 금지한다.

**Shape lock**: 컨테이너 `rounded-2xl`, 카드/입력 `rounded-xl`, 칩/원형 버튼 `rounded-full`.

## 3. 전역 상호작용 레이어 (`globals.css`)

- **커서**: `button:not(:disabled)`, `[role=button]`, `a[href]`, `label[for]`, `select`, `summary`,
  `input[type=submit]` → `cursor: pointer`. `:disabled` → `not-allowed`.
- **포커스**: `:focus-visible` 에 라임 `outline` 2px + `outline-offset` 2px. 마우스 클릭에는 안 뜬다.
- **누름**: 상호작용 요소 `:active` 에 `scale(0.97)`.
- **전환**: 색·배경·보더·transform 160ms `cubic-bezier(0.16, 1, 0.3, 1)`.
- **스크롤바**: WebKit `::-webkit-scrollbar` 10px, 트랙 투명, thumb `--color-border-strong`
  라운드, hover 시 밝아짐. Firefox `scrollbar-width: thin` + `scrollbar-color`.
  `html { scrollbar-gutter: stable }` 로 스크롤바 등장 시 레이아웃 흔들림 제거.
  `.scrollbar-none` 유틸(칩 가로 스크롤·쇼츠 피드용).
- **모션 감소**: `@media (prefers-reduced-motion: reduce)` 에서 transition/animation 무력화.
- `::selection` 라임 배경, `scroll-behavior: smooth`, skip-to-content 링크 스타일.

## 4. 반응형 레이아웃

모바일 감각은 지금 그대로 두고 PC를 새로 만든다.

- 컨테이너: `max-w-md` → `sm:max-w-2xl lg:max-w-5xl xl:max-w-6xl`
- 비디오 그리드: `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5`
- 네비게이션:
  - `BottomTabBar` 는 `md:hidden` (모바일 전용, 세이프 에어리어 패딩 추가)
  - `TopNav` 신규 — `hidden md:flex`, 높이 64px, 좌측 워드마크 + 우측 현재 탭 표시
- 피드: PC에서 9:16 플레이어를 중앙 정렬하고 좌우 여백은 흐린 썸네일 배경으로 채운다.
  키보드 `↑`/`↓`/`PageUp`/`PageDown` 으로 슬라이드 이동.

## 5. 컴포넌트별 변경

| 컴포넌트 | 변경 |
|---|---|
| `loading.tsx` (신규) | `(tabs)` 라우트 스켈레톤 그리드. 검색 대기 중 레이아웃 그대로 보여준다 |
| `SearchBar` | 검색 아이콘, 값이 있을 때 지우기(×) 버튼, `enterKeyHint="search"`, 포커스 링, PC 폭 확장 |
| `CategoryChips` | 현재 `q` 와 일치하는 칩 활성 표시(`aria-current`), 좌우 페이드 마스크, 스크롤바 숨김 |
| `VideoGrid` | 반응형 열, hover 시 썸네일 `scale(1.04)` + 재생 오버레이, 포커스 링, 배지 mono+tabular |
| `EmptyState` | 아이콘 + 재구성된 추천 칩 |
| `QuotaBanner` | 아이콘 + 정제된 danger 톤 |
| `SuggestPanel` (신규) | 검색 전 초기 화면. 한 줄 안내 대신 인기 운동 제안 |
| `FeedSlide` | 그라디언트·타이포 정리, 채널명 계층 정리 |
| `ShortsFeed` | 데스크톱 레이아웃, 키보드 이동, 진행 인디케이터 |
| `BackButton` | 아이콘화, hover/active/focus, 세이프 에어리어 |
| `error.tsx` × 2, `not-found.tsx` | 새 토큰으로 재작성 |

아이콘은 `@phosphor-icons/react` 를 쓴다. Taste Skill이 `lucide-react` 를 비권장하고 직접 SVG를
그리는 것을 금지한다. stroke weight 는 `regular` 하나로 통일한다.

## 6. 보존 계약 (깨뜨리면 안 되는 것)

E2E가 의존하므로 아래는 그대로 유지한다.

- `data-testid`: `video-card`, `feed-slide`, `back-button`, `empty-state`, `quota-banner`, `error-state`
- 접근성 이름: 입력 `aria-label="운동 이름"`, 버튼 `검색` / `다시 시도`
- URL 구조: `/?q=`, `/feed?q=&i=`
- **그리드 페이지는 window 스크롤을 유지한다.** 스크롤 복원 테스트가 `window.scrollY` 를 읽으므로
  그리드를 `overflow-y-auto` 내부 컨테이너에 넣으면 안 된다.
- `MOUNT_WINDOW = 1` (iframe 3개 검증)
- `EmptyState` 의 추천 링크 접근성 이름(`스쿼트` 등)

## 7. 검증

`npm run lint` → `npm test` → `npm run test:e2e` → `npm run build` 순으로 전부 통과시킨다.

## 8. Taste Skill 설치물 커밋 정책

- `.agents/skills/**`, `skills-lock.json` 은 커밋한다. 다른 사람도 같은 스킬을 받는다.
- `.claude/skills/` 는 `.gitignore` 에 넣는다. 절대 경로 심볼릭 링크라 다른 머신에서 깨진다.
  재생성은 `npx skills add Leonxlnx/taste-skill` 로 한다.

## 범위 밖

- 라이트 모드 (영상 썸네일 위주 앱이라 다크가 유리하고, 작업량 대비 이득이 작다)
- 검색 자동완성·최근 검색어 (별도 기능, 별도 스펙)
- README 에 적힌 Supabase 장애 시 지연 문제 (기존 계획 문서에 남아있는 별개 결함)
