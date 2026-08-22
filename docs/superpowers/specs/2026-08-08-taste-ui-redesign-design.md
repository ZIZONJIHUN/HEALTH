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
  받아오는 스크립트는 `scripts/fetch-pretendard.mjs`.
- 전체 2.82MB지만 `unicode-range` 로 쪼개져 있어 화면에 실제로 쓰인 글자 범위만 내려받는다.
  실측(프로덕션 빌드, 콜드 캐시):
  - 첫 화면(`/`): 2조각 **57KB**
  - 검색 결과(`/?q=스쿼트`): 11조각 **277KB** — 영상 제목이 임의의 한국어라 범위가 넓어진다
  - 대안 비교: full variable 단일 파일은 **2,009KB 를 항상 전량** 받고,
    static subset 3 weight 는 **806KB** 다. 어느 화면에서든 dynamic subset 이 유리하고,
    가변 폰트라 weight 5종(400~800)을 추가 비용 없이 쓴다.
- `font-display: swap`. 어떤 화면에서든 반드시 쓰이는 91번(기본 라틴 + 최빈 한글)과
  90번(차빈 한글)만 `<link rel="preload">` 한다.
- Geist Mono 는 **69KB** 이고 `.tabular` 가 렌더되는 화면(검색 결과·피드)에서만 내려간다.
  첫 화면에서는 preload 되지 않는다.

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
| `page.tsx` | 결과만 `<Suspense>` 로 감싸고 스켈레톤을 폴백으로 준다 (아래 참고) |
| `SearchHeader` (신규) | page 와 error 화면이 같은 머리말(제목·검색창·칩)을 공유한다 |
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
그리는 것을 금지한다. 굵기는 `src/components/icons.ts` 의 `ICON_WEIGHT` 하나로 통일하고,
최상위 배럴(`'use client'`) 대신 `dist/ssr/<이름>` 을 거쳐 가져와 서버 컴포넌트에 클라이언트
경계가 생기지 않게 한다.

### 로딩 상태는 `loading.tsx` 가 아니라 `<Suspense>` 로 한다

`loading.tsx` 를 두면 Next 가 라우트 전체를 감싸므로 `q` 가 바뀔 때마다 **검색창과 칩까지**
스켈레톤으로 사라진다. 느린 것은 `getVideos` 뿐이므로 결과 영역만 `<Suspense key={q}>` 로
감싼다. 검색창은 즉시 스트리밍되고, 기다리는 동안 다른 검색어를 칠 수 있다.
`key={q}` 가 없으면 검색어가 바뀌어도 폴백이 다시 뜨지 않는다.

## 6. 보존 계약 (깨뜨리면 안 되는 것)

E2E가 의존하므로 아래는 그대로 유지한다.

- `data-testid`: `video-card`, `feed-slide`, `back-button`, `empty-state`, `quota-banner`, `error-state`
- 접근성 이름: 입력 `aria-label="운동 이름"`, 버튼 `검색` / `다시 시도`
- URL 구조: `/?q=`, `/feed?q=&i=`
- **그리드 페이지는 window 스크롤을 유지한다.** 스크롤 복원 테스트가 `window.scrollY` 를 읽으므로
  그리드를 `overflow-y-auto` 내부 컨테이너에 넣으면 안 된다.
- `MOUNT_WINDOW = 1` (iframe 3개 검증)
- `EmptyState` 의 추천 링크 접근성 이름(`스쿼트` 등)
- **새 버튼의 접근성 이름에 기존 버튼 이름을 부분 문자열로 넣지 않는다.**
  `getByRole('button', { name: '검색' })` 은 부분 일치라, 지우기 버튼을 "검색어 지우기" 로
  두면 제출 버튼과 함께 잡혀 strict mode 위반이 난다. "입력 지우기" 로 둔다.

## 7. 검증

`npm run lint` → `npm test` → `npm run test:e2e` → `npm run build` 순으로 전부 통과시킨다.

## 8. Taste Skill 설치물 커밋 정책

- `.agents/skills/**`, `skills-lock.json` 은 커밋한다. 다른 사람도 같은 스킬을 받는다.
- `.claude/skills/` 는 `.gitignore` 에 넣는다. 절대 경로 심볼릭 링크라 다른 머신에서 깨진다.
  재생성은 `npx skills add Leonxlnx/taste-skill` 로 한다.

## 9. 3D 인체 부위 선택기 (2차 요청)

### 왜 2D 해부도가 아니라 3D인가

MuscleWiki·Fitbod 같은 레퍼런스는 전부 2D 해부도를 쓴다. 그럼에도 3D로 간 것은
사용자가 명시적으로 선택했기 때문이다. 대가는 아래 "비용" 절에 적어 둔다.

### 모델 조달

진짜 병목은 용량이 아니라 **근육 단위로 메시가 나뉘고 상업적 사용이 가능한 모델**이었다.
CC0 해부 모델은 대개 통짜라 부위 클릭이 불가능하다.

[BodyParts3D](https://lifesciencedb.jp/bp3d/) (Database Center for Life Science) 는 FMA ID
단위로 분리된 메시를 제공한다. 필요한 근육 58개 + 피부 1개가 전부 있다.

**라이선스: CC BY-SA 2.1 JP.** 표기 의무가 있고 가공한 모델도 같은 라이선스를 유지한다.
코드베이스에는 영향이 없다. 표기는 `BodyPanel` 에 붙어 있다 — 모델을 쓰는 곳과 표기를
같은 파일에 둬야 나중에 떨어지지 않는다.

### 빌드 파이프라인 (`scripts/build-body-model.mjs`)

원본 59개 합계 **293MB**(580만 삼각형) → `public/models/body.glb` **533KB**(5.3만 삼각형).

1. STL 내려받아 `.cache/bodyparts3d/` 에 캐시 (gitignore, 재실행 시 재사용)
2. 바이너리 STL 파싱 → 좌표계 변환(의학 Z-up → glTF Y-up)·중심 정렬·키=1 정규화를
   **정점에 구워 넣는다.** 앱이 회전·스케일 매직넘버를 들지 않게 하려는 것이다
3. `weld` + `dedup`
4. 부위별 삼각형 예산으로 감산. 부위 안에서는 원본 밀도에 비례해 배분한다
5. `quantize`(KHR_mesh_quantization) — 디코더가 필요 없어 런타임 비용이 0이다

**함정 두 개** (둘 다 실제로 밟았다):

- `gltf-transform` 의 `simplify()` 는 씬이 아니라 **문서의 모든 메시**에 걸린다.
  노드를 씬에서 빼도 소용없다. 부위별로 다른 비율을 주려면 프리미티브 단위로 직접 돌려야 한다.
- meshoptimizer WASM 은 인덱스를 **uint32 로 읽는다.** `weld()` 는 정점이 65536개 미만이면
  `Uint16Array` 를 준다. 그대로 넘기면 WASM 이 두 칸을 한 인덱스로 잘못 읽어 결과가 통째로
  망가진다 — 바운딩 박스는 멀쩡해 보이는데 화면에는 점만 찍힌다.
  또 `compactMesh()` 는 넘긴 인덱스 배열을 **제자리에서 이미 remap 한다.** 반환된 remap 은
  정점 버퍼를 다시 쓸 때만 쓴다. 인덱스에 또 적용하면 안 된다.

### 뷰어 (`BodyModelPicker`)

`three` 만 쓴다. 캔버스 하나에 모델 하나뿐이라 react-three-fiber 의 리컨실러가 필요 없고,
의존성도 그만큼 줄어든다.

- 드래그 회전 + 놓아두면 아주 느린 자동 회전 (`prefers-reduced-motion` 에서는 정지)
- 부위 hover → 캡션에 이름, 클릭 → `/?q=<부위 검색어>` 로 이동
- 드래그와 클릭은 이동 거리 6px 로 구분한다
- 액센트는 라임 하나로 잠근다. 선택된 부위만 emissive 를 준다
- `three` 와 모델은 **화면에 들어올 때** 받는다(IntersectionObserver). 데스크톱은 왼쪽 레일이
  처음부터 보이므로 즉시, 모바일은 접힌 화면 아래라 스크롤해야 받는다

**접근성**: 캔버스는 키보드로 쓸 수 없다. 같은 일을 하는 `CategoryChips` 를 항상 함께
렌더하고 캔버스는 `aria-hidden` 으로 둔다. WebGL 이 없거나 로딩에 실패하면 패널이 조용히
사라지고 칩만 남는다 — **부위 선택이 불가능해지는 상황은 만들지 않는다.**

### 비용

- `three` ≈ 170KB gzip + 모델 533KB. 첫 화면 번들에는 들어가지 않는다(동적 import)
- 부위 세분화는 하지 않았다. 기존 7개 부위를 그대로 쓰므로 캐시 적중률과 YouTube 쿼터
  소모가 지금과 같다

## 10. 2단 데스크톱 레이아웃

1152px 고정 폭이라 넓은 모니터에서 좌우가 크게 남았다.

- 최대 폭 `lg:max-w-6xl xl:max-w-[1500px]`
- `lg` 이상에서 `grid-cols-[320px_minmax(0,1fr)]` — 왼쪽 레일에 3D 인체도(sticky), 오른쪽에
  검색창과 결과
- `grid-rows-[auto_1fr]` 를 고정해야 한다. 안 그러면 두 행에 걸친 왼쪽 레일의 높이가 두 행에
  나눠 배분되면서 머리말과 결과 사이에 빈 공간이 생긴다
- 그리드 열은 왼쪽 레일이 먹는 폭을 감안해 `lg:3 → xl:4 → 2xl:5` 로 잡고 `sizes` 도 맞춘다
- DOM 순서는 모바일 기준(머리말 → 인체도 → 결과)이고 데스크톱은 그리드 배치로만 옮긴다.
  `order` 로 뒤집으면 탭 순서가 화면 순서와 어긋난다
- 모바일에서 검색 중이면 인체도를 접는다. 결과가 주인공이다

## 범위 밖

- 라이트 모드 (영상 썸네일 위주 앱이라 다크가 유리하고, 작업량 대비 이득이 작다)
- 검색 자동완성·최근 검색어 (별도 기능, 별도 스펙)
- README 에 적힌 Supabase 장애 시 지연 문제 (기존 계획 문서에 남아있는 별개 결함)
