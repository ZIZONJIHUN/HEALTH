# 루틴 동기화 · 운동 기록 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로그인한 사용자의 루틴과 운동 기록을 Supabase 로 기기 간 동기화하고, 루틴을 끝내면 운동 기록을 남겨 루틴 화면에 이번 주·연속 일수·이번 달 횟수를 보여준다. 루틴의 운동마다 규칙으로 추천한 휴식 시간을 두고, 루틴 재생에서 직접 시작하는 휴식 타이머를 준다.

**Architecture:** 화면은 지금처럼 localStorage 만 동기적으로 읽는다(`useSyncExternalStore`). 저장 항목에 `owner`/`updatedAt`/`deletedAt`/`dirty`/`syncError` 를 더하고, 루트 레이아웃의 클라이언트 컨트롤러가 로그인 사용자를 감시하며 당기기(병합)·밀기(upsert)를 돌린다. 병합·통계·세션 전환 판단은 순수 함수로 두고 단위 테스트한다. 서버는 RLS 가 걸린 두 표와 상한 트리거.

**Tech Stack:** Next 16 (App Router), React 19, `@supabase/ssr` 브라우저 클라이언트(anon + RLS), Postgres(Supabase), Vitest(node 환경, window 스텁), Playwright(Supabase 없이).

**Spec:** `docs/superpowers/specs/2026-10-31-routine-sync-and-workout-log-design.md`

## Global Constraints

- 사용자 데이터에 `service` 클라이언트(`lib/supabase/service.ts`)를 **절대** 쓰지 않는다. 브라우저 anon 클라이언트 + RLS 만. 라우트 핸들러를 새로 만들지 않는다.
- 상한(로컬·서버 같은 값): 루틴 이름 1~60자, 루틴당 운동 100개, 살아 있는 루틴 200개, 같은 `local_date` 운동 기록 20건. 묘비는 루틴 수에 세지 않고 30일 뒤 다음 쓰기 때 트리거가 지운다.
- 병합: 같은 id 는 `updatedAt` 이 큰 쪽이 이긴다(묘비 포함). 항목 단위 병합 없음.
- 조용한 실패 금지: 저장·동기화 실패는 화면에 드러난다.
- 비로그인 사용자 동작은 바뀌지 않는다. 가입 벽 없음.
- 휴식 시간: 프리셋 30 / 60 / 90초, 조절 10초 단위, 범위 10~300초. 추천은 규칙(LLM 호출 없음)이고 저장하지 않으며 제목에서 매번 계산한다. 휴식은 사용자가 직접 시작한다(영상 끝에 자동 시작 없음). 검색 피드에는 타이머가 없다.
- Supabase 미설정(`createSupabaseBrowserClient() === null`)이면 동기화 계층 전체가 아무것도 하지 않는다. E2E 는 이 상태로 돈다.
- 아이콘은 `components/ui/icons.ts` 로만, 색은 `globals.css` 토큰만, 클래스 문자열 복붙 대신 `components/ui` 프리미티브.
- 문구는 반말이 아닌 지금 앱의 "~해요" 체.
- 검증 명령: `npm run lint -- --max-warnings 0`, `npx tsc --noEmit`, `npm test`, `npm run test:e2e`.

## Review Focus

1. **로그인 상태에서 루틴을 지우고 "되돌리기"** — 되살린 루틴이 서버에서도 살아나야 한다. `restoreRoutine` 은 `deletedAt=null`, `updatedAt=now`, `dirty=true` 로 만든다. (Task 2 테스트)
2. **같은 재생에서 끝 감지와 "운동 완료" 버튼이 둘 다 일어남** — 기록은 1건. (Task 8 E2E)
3. **자정·주 경계·월 경계** — 주는 월요일 시작, 일요일 23:59 기록은 그 주, 연속 일수는 오늘 미기록이어도 어제까지 이어지면 유지. (Task 5 테스트)
4. **밀기 도중 오프라인 / 401** — 일시 실패로 `dirty` 유지, 상태 줄 "아직 계정에 저장되지 않았어요", 재시도. 제약 위반(23514, P0001)만 `rejected`. (Task 4 테스트)
5. **휴식 중 폰 화면이 꺼지거나 탭이 백그라운드로 감** — 돌아왔을 때 남은 시간이 실제 경과에 맞다. 끝나는 시각 기준 계산. (Task 9 단위 테스트)
6. **v1 데이터에 60자 넘는 이름** — v2 변환 때 60자로 자른다. 100개 넘는 항목은 자르지 않는다(데이터 손실 금지) — 서버가 거절하면 `rejected` 로 보인다. (Task 2 테스트)

---

### Task 1: 휴식 시간 추천 규칙

**Files:**
- Create: `src/features/routines/rest.ts`
- Test: `tests/unit/rest.test.ts`

**Interfaces:**
- Produces:
  - `const REST = { presets: [30, 60, 90], step: 10, min: 10, max: 300 } as const`
  - `suggestRestSeconds(title: string): 30 | 60 | 90` — 스펙 6.1 표. 소문자화 + 공백 제거 후 포함 여부. 90 → 60 → 30 순으로 검사해 처음 걸린 값, 없으면 60.
  - `clampRest(seconds: number): number` — 10 의 배수로 반올림 후 [10, 300] 으로 자른다. 사용자 조절용.
  - `normalizeRest(value: unknown, title: string): number` — 저장소에서 읽은 값용. 유한한 숫자가 아니거나 [10, 300] 밖이면 `suggestRestSeconds(title)`, 아니면 `clampRest(value)`.
  - `formatRest(seconds: number): string` — 30 → "30초", 90 → "1분 30초", 120 → "2분", 300 → "5분"

- [ ] **Step 1: 테스트** — 스펙 6.1 표의 키워드마다 한 제목씩(`it.each`) 기대값. 추가로:

```ts
expect(suggestRestSeconds('벤치 프레스 자세 교정')).toBe(90) // 공백 무시
expect(suggestRestSeconds('Romanian Deadlift form')).toBe(90)
expect(suggestRestSeconds('덤벨 컬 + 플랭크 서킷')).toBe(60) // 여러 분류면 긴 쪽
expect(suggestRestSeconds('오늘의 브이로그')).toBe(60)
expect(clampRest(95)).toBe(100); expect(clampRest(0)).toBe(10); expect(clampRest(999)).toBe(300)
expect(normalizeRest('60', '플랭크')).toBe(30); expect(normalizeRest(500, '스쿼트')).toBe(90)
expect(formatRest(90)).toBe('1분 30초'); expect(formatRest(120)).toBe('2분')
```

- [ ] **Step 2: 실패 확인** — `npx vitest run tests/unit/rest.test.ts` FAIL
- [ ] **Step 3: 구현** — 키워드 표는 분류별 배열 상수로 둔다(한글·영문 함께).
- [ ] **Step 4: 통과 확인** — 같은 명령 PASS
- [ ] **Step 5: Commit** — `feat: 운동 이름으로 휴식 시간을 추천하는 규칙을 추가한다`

---

### Task 2: 루틴 저장소 v2 (owner·묘비·상한·휴식 시간)

**Files:**
- Modify: `src/features/routines/routines.ts`
- Modify: `src/features/routines/AddToRoutineButton.tsx` (새 결과값 처리)
- Test: `tests/unit/routines.test.ts`

**Interfaces:**
- Produces:
  - Consumes: `suggestRestSeconds`, `normalizeRest`, `clampRest` (Task 1)
  - `type RoutineItem = ShortVideo & { restSeconds: number }`; `Routine = { id, name, createdAt, items: RoutineItem[] }`
  - `type StoredRoutine = Routine & { updatedAt: number; deletedAt: number | null; owner: string | null; dirty: boolean; syncError: string | null }`
  - 읽을 때 모든 항목의 `restSeconds` 를 `normalizeRest(item.restSeconds, item.title)` 로 맞춘다(v1 변환 포함). `addVideoToRoutine` 은 `restSeconds = suggestRestSeconds(video.title)` 로 담는다.
  - `setItemRest(routineId: string, videoId: string, seconds: number): boolean` — `clampRest` 후 저장, 다른 변경 함수와 같은 `updatedAt`/`dirty` 규칙.
  - `const LIMITS = { nameLength: 60, items: 100, routines: 200 } as const`
  - `setActiveOwner(userId: string | null): void` — 지금 화면의 주인. 바뀌면 리스너에 알린다. 기본 null.
  - `getActiveOwner(): string | null`
  - `loadRoutines(): Routine[]` — `owner === activeOwner && deletedAt === null` 만. 참조 안정성 유지.
  - `loadStoredRoutines(): StoredRoutine[]` — 전부(동기화용).
  - `replaceStoredRoutines(next: StoredRoutine[]): boolean` — 통째로 저장하고 알린다.
  - `createRoutine(name: string): Routine | null` — 살아 있는 내 루틴이 200개면 null.
  - `addVideoToRoutine(...)`: `'added' | 'duplicate' | 'full' | 'failed'`
  - 모든 변경 함수는 대상의 `updatedAt=Date.now()`, `dirty = activeOwner !== null`, `syncError=null` 로 만든다. 새 루틴의 `owner = activeOwner`.
  - `deleteRoutine`: owner 가 null 이면 지금처럼 배열에서 뺀다. 아니면 묘비(`deletedAt=now`). 반환형 그대로.
  - `restoreRoutine(routine, index)`: 묘비면 되살린다(Review Focus 1), 없으면 지금처럼 끼워 넣는다.
- 저장 키 `health-shorts:routines:v2`. v2 가 없고 v1 이 있으면 v1 을 읽어 `updatedAt=createdAt, deletedAt=null, owner=null, dirty=false, syncError=null`, 이름 60자 절단으로 변환해 v2 에 쓰고 v1 은 지우지 않는다.

- [ ] **Step 1: 실패하는 테스트를 더한다** (`tests/unit/routines.test.ts`, 기존 테스트는 유지하고 키만 v2 로 바뀌는 곳을 고친다)

```ts
it('v1 을 v2 로 옮기고 긴 이름을 자른다', async () => {
  store.set('health-shorts:routines:v1', JSON.stringify([{ id: 'r1', name: 'x'.repeat(80), createdAt: 5, items: [] }]))
  const { loadStoredRoutines } = await freshModule()
  expect(loadStoredRoutines()[0]).toMatchObject({ id: 'r1', updatedAt: 5, owner: null, deletedAt: null, dirty: false })
  expect(loadStoredRoutines()[0].name).toHaveLength(60)
})
it('다른 주인의 루틴은 보이지 않는다', async () => {
  const m = await freshModule()
  m.createRoutine('손님 루틴')
  m.setActiveOwner('u1')
  expect(m.loadRoutines()).toEqual([])
  m.createRoutine('내 루틴')
  expect(m.loadRoutines().map((r) => r.name)).toEqual(['내 루틴'])
  m.setActiveOwner(null)
  expect(m.loadRoutines().map((r) => r.name)).toEqual(['손님 루틴'])
})
it('로그인 중 변경은 dirty, 비로그인 변경은 아니다', async () => { /* createRoutine 후 loadStoredRoutines()[0].dirty 를 두 상태에서 단정 */ })
it('로그인 중 지우면 묘비가 되고 되돌리면 dirty 로 살아난다', async () => {
  const m = await freshModule(); m.setActiveOwner('u1')
  const r = m.createRoutine('가슴')!
  const deleted = m.deleteRoutine(r.id)!
  expect(m.loadRoutines()).toEqual([])
  expect(m.loadStoredRoutines()[0].deletedAt).not.toBeNull()
  m.restoreRoutine(deleted.routine, deleted.index)
  expect(m.loadStoredRoutines()[0]).toMatchObject({ deletedAt: null, dirty: true })
})
it('담을 때 휴식 시간을 추천값으로 채운다', async () => { /* 제목 '플랭크 30초' → restSeconds 30 */ })
it('v1 항목에 휴식 시간을 채우고 이상한 값은 추천값으로 되돌린다', async () => { /* v1 항목 restSeconds 없음 → 추천값; v2 에 restSeconds: 'x' → 추천값 */ })
it('휴식 시간을 바꾸면 10초 단위로 저장된다', async () => { /* setItemRest(.., 95) → 100, 로그인 중이면 dirty */ })
it('루틴당 100개를 넘겨 담지 않는다', async () => { /* 100개 담은 뒤 101번째가 'full' */ })
it('살아 있는 루틴이 200개면 더 만들지 않는다', async () => { /* 200개 후 createRoutine 이 null, 하나 지우면 다시 만들어진다 */ })
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run tests/unit/routines.test.ts` / Expected: 새 테스트 FAIL

- [ ] **Step 3: `routines.ts` 를 위 인터페이스대로 고친다.** 파일 머리 주석의 "이 앱에는 로그인이 없다" 문단을 "화면은 localStorage 만 읽고 서버 동기화는 routineSync.ts 가 한다"로 고친다. `resetRoutinesForTest` 는 v1·v2 키를 모두 지우고 `activeOwner` 를 null 로 되돌린다.

- [ ] **Step 4: `AddToRoutineButton.tsx`** — `createRoutine` 이 null 이면 "루틴은 200개까지 만들 수 있어요", `'full'` 이면 "한 루틴에는 100개까지 담을 수 있어요"를 기존 실패 안내 자리(4초)에 띄운다. 새 루틴 이름 입력에 `maxLength={60}`. `RoutineList` 의 이름 바꾸기 입력에도 `maxLength={60}`.

- [ ] **Step 5: 통과 확인** — `npx vitest run tests/unit/routines.test.ts && npx tsc --noEmit` / Expected: PASS, 타입 오류 없음. `npm run test:e2e` 의 루틴 테스트 6개 PASS(비로그인 회귀).

- [ ] **Step 6: Commit** — `feat: 루틴 저장소에 주인·묘비·상한을 더한다`

---

### Task 3: 병합 · 세션 전환 판단 (순수 함수)

**Files:**
- Create: `src/features/routines/merge.ts`
- Test: `tests/unit/routineMerge.test.ts`

**Interfaces:**
- Consumes: `StoredRoutine` (Task 2)
- Produces:
  - `mergeRoutines(local: StoredRoutine[], remote: StoredRoutine[], owner: string): StoredRoutine[]` — `owner` 소유 로컬 항목과 remote 를 id 로 합친다. 같은 id 는 `updatedAt` 큰 쪽, 같으면 remote. 이긴 쪽이 로컬이고 remote 와 다르면 `dirty=true`. 다른 주인(null 포함)의 로컬 항목은 손대지 않고 그대로 결과에 남긴다. 순서는 로컬 순서를 유지하고 remote 에만 있는 것은 remote 의 `createdAt` 순으로 뒤에 붙인다.
  - `adoptGuestRoutines(local: StoredRoutine[], owner: string): StoredRoutine[]` — `owner === null` 인 것을 `owner`, `dirty=true`, `updatedAt=Date.now()` 로. 묘비는 버린다.
  - `cleanupAfterSignOut(local: StoredRoutine[], owner: string): StoredRoutine[]` — 그 주인의 `dirty=false` 인 항목(묘비 포함)을 뺀다. dirty 는 남긴다.
  - `type SessionChange = { kind: 'none' } | { kind: 'signed-in'; userId: string } | { kind: 'signed-out'; previous: string } | { kind: 'switched'; previous: string; userId: string }`
  - `classifySessionChange(lastUserId: string | null, currentUserId: string | null): SessionChange`

- [ ] **Step 1: 테스트**

```ts
it('나중에 고친 쪽이 이긴다', () => { /* local updatedAt 10 vs remote 20 → remote 이름 */ })
it('로컬이 이기면 dirty 로 표시한다', () => { /* local 30 vs remote 20 → dirty true */ })
it('지운 것이 나중이면 지워지고, 고친 것이 나중이면 되살아난다', () => { /* 묘비 양방향 */ })
it('한쪽에만 있는 루틴은 남는다', () => {})
it('다른 주인의 로컬 루틴은 건드리지 않는다', () => { /* owner null, owner 'u2' 항목이 결과에 그대로 */ })
it('손님 루틴을 가져오면 내 것이 되고 dirty 다', () => {})
it('로그아웃하면 반영된 것만 지우고 못 민 것은 남긴다', () => {})
it('세션 변화를 구분한다', () => {
  expect(classifySessionChange(null, null)).toEqual({ kind: 'none' })
  expect(classifySessionChange(null, 'u1')).toEqual({ kind: 'signed-in', userId: 'u1' })
  expect(classifySessionChange('u1', null)).toEqual({ kind: 'signed-out', previous: 'u1' })
  expect(classifySessionChange('u1', 'u2')).toEqual({ kind: 'switched', previous: 'u1', userId: 'u2' })
  expect(classifySessionChange('u1', 'u1')).toEqual({ kind: 'none' })
})
```

- [ ] **Step 2: 실패 확인** — `npx vitest run tests/unit/routineMerge.test.ts` / FAIL(모듈 없음)
- [ ] **Step 3: 구현** (`merge.ts`)
- [ ] **Step 4: 통과 확인** — 같은 명령 PASS
- [ ] **Step 5: Commit** — `feat: 루틴 병합과 세션 전환 판단을 순수 함수로 둔다`

---

### Task 4: 마이그레이션 + 서버 입출력 + 점검 스크립트

**Files:**
- Create: `supabase/migrations/0004_routines_and_workouts.sql`
- Create: `src/features/routines/routineSync.ts`
- Create: `scripts/check-sync.ts`, Modify: `package.json` (`"sync:check": "tsx --env-file=.env.local scripts/check-sync.ts"`)
- Test: `tests/unit/routineSync.test.ts`

**Interfaces:**
- Consumes: `StoredRoutine`, `LIMITS` (Task 2). 운동 기록 입출력 함수는 Task 5 에서 이 파일에 더한다(표는 여기서 함께 만든다).
- Produces:
  - `fetchRoutines(client: SupabaseClient, userId: string): Promise<StoredRoutine[]>` — 행을 `owner=userId, dirty=false, syncError=null` 로 변환.
  - `pushRoutine(client, userId, routine: StoredRoutine, position: number): Promise<PushResult>`
  - `type PushResult = { ok: true } | { ok: false; kind: 'transient' } | { ok: false; kind: 'rejected'; reason: string }`
  - `classifyPushError(error: { code?: string; message: string } | null): PushResult` — null → ok; code `23514`(check), `P0001`(트리거 raise), `22001`(too long) → rejected(reason 은 사람이 읽는 한국어: 루틴 수 초과 / 운동 수 초과 / 이름 길이); 그 외 → transient.

**SQL (0004) 결정 사항:**
- `public.routines(user_id uuid not null references auth.users on delete cascade, id text not null check (char_length(id) between 1 and 64), name text not null check (char_length(name) between 1 and 60), items jsonb not null check (jsonb_typeof(items)='array' and jsonb_array_length(items) <= 100), position int not null default 0, created_at timestamptz not null, updated_at timestamptz not null, deleted_at timestamptz, primary key (user_id, id))`
- `public.workout_logs(user_id uuid not null references auth.users on delete cascade, id text not null check (char_length(id) between 1 and 64), routine_id text not null, routine_name text not null check (char_length(routine_name) <= 60), completed_at timestamptz not null, local_date date not null, primary key (user_id, id))`
- 두 표 RLS on. routines: select / insert / update 정책 모두 `user_id = auth.uid()` (insert·update 는 `with check` 도). workout_logs: select / insert 만. delete 정책 없음.
- `before insert or update on routines` 트리거(security definer, `set search_path = ''`, 0003 과 같은 이유 주석): ① `delete from public.routines where user_id = new.user_id and deleted_at < now() - interval '30 days'` ② `new.deleted_at is null` 이고 이 행을 뺀 같은 사용자의 살아 있는 루틴이 200 이상이면 `raise exception '루틴은 200개까지 저장할 수 있어요'`.
- `before insert on workout_logs` 트리거: 같은 `user_id, local_date` 가 20 이상이면 raise.
- 파일 머리에 "SQL Editor 에서 실행" 안내(0003 과 같은 형식).

- [ ] **Step 1: 테스트** (`routineSync.test.ts`, 가짜 client: `from().select().eq()` / `from().upsert()` 체인을 `vi.fn` 으로 흉내)

```ts
it('행을 StoredRoutine 으로 바꾼다', async () => { /* updated_at ISO → ms, owner/dirty */ })
it('upsert 에 user_id 와 position 을 싣는다', async () => { /* onConflict: 'user_id,id' */ })
it('제약 위반은 rejected, 그 외는 transient', () => {
  expect(classifyPushError({ code: '23514', message: '' })).toMatchObject({ kind: 'rejected' })
  expect(classifyPushError({ code: 'P0001', message: '루틴은 200개까지 저장할 수 있어요' })).toMatchObject({ kind: 'rejected' })
  expect(classifyPushError({ code: 'PGRST301', message: 'JWT expired' })).toMatchObject({ kind: 'transient' })
  expect(classifyPushError({ message: 'Failed to fetch' })).toMatchObject({ kind: 'transient' })
})
```

- [ ] **Step 2: 실패 확인** — `npx vitest run tests/unit/routineSync.test.ts` / FAIL
- [ ] **Step 3: SQL 과 `routineSync.ts` 를 쓴다**
- [ ] **Step 4: `scripts/check-sync.ts`** — `check-auth.ts` 형식. anon(비로그인)으로 ① `routines` select 가 오류 없이 0행(표 없음 42P01 이면 0004 실행 안내) ② `routines` insert 가 거부되는지 ③ `workout_logs` 도 같은지. 성공 문구와, 로그인 상태 왕복은 README 수동 확인이라는 안내.
- [ ] **Step 5: 통과 확인** — `npx vitest run tests/unit/routineSync.test.ts` PASS. 사용자에게 0004 를 SQL Editor 에서 실행해 달라고 요청한 뒤 `npm run sync:check` → "성공". (실행 전이면 "표가 없습니다" 안내가 나오는 것을 확인하고 넘어간다 — 실패로 보고하지 말고 대기 항목으로 보고)
- [ ] **Step 6: Commit** — `feat: 루틴·운동 기록 표와 서버 입출력을 추가한다`

---

### Task 5: 운동 기록 저장소 + 통계

**Files:**
- Create: `src/features/workouts/workouts.ts`, `src/features/workouts/useWorkouts.ts`, `src/features/workouts/stats.ts`
- Modify: `src/features/routines/routineSync.ts` (기록 입출력)
- Test: `tests/unit/workouts.test.ts`, `tests/unit/workoutStats.test.ts`

**Interfaces:**
- Consumes: `getActiveOwner` (Task 2) — 기록의 owner 는 기록 시점의 activeOwner
- Produces:
  - `type WorkoutLog = { id: string; routineId: string; routineName: string; completedAt: number; localDate: string; owner: string | null; dirty: boolean }` (localDate `YYYY-MM-DD`, 기기 현지 날짜)
  - `recordWorkout(routine: { id: string; name: string }, now?: Date): 'recorded' | 'limit' | 'failed'` — 같은 localDate·같은 owner 20건이면 'limit'
  - `loadWorkouts(): WorkoutLog[]` (activeOwner 것만, 참조 안정), `loadStoredWorkouts()`, `replaceStoredWorkouts(next)`, `subscribeWorkouts`, `useWorkouts()`; 키 `health-shorts:workouts:v1`. owner 변경 알림은 Task 2 의 `setActiveOwner` 리스너를 통해 받는다(`subscribeWorkouts` 가 routines 리스너도 구독하거나 `setActiveOwner` 가 두 저장소에 알린다 — 후자: `routines.ts` 에 `onActiveOwnerChange(listener)` 를 export 해서 쓴다).
  - `mergeWorkouts(local, remote, owner): WorkoutLog[]` (id 합집합, remote 에 없는 로컬은 dirty), `adoptGuestWorkouts`, `cleanupWorkoutsAfterSignOut` — `merge.ts` 의 루틴판과 같은 규칙. `merge.ts` 에 둔다.
  - `stats.ts`: `workoutStats(logs: WorkoutLog[], today: Date): { week: { date: string; done: boolean; isToday: boolean }[]; streak: number; monthCount: number }` — 주는 월요일 시작 7칸, monthCount 는 이번 달 **기록 건수**, streak 은 서로 다른 날짜 기준.
  - `routineSync.ts`: `fetchWorkouts(client, userId)`, `pushWorkout(client, userId, log): Promise<PushResult>` (insert, 23505 중복은 ok 로 본다).

- [ ] **Step 1: 테스트**

```ts
// workoutStats.test.ts — today = 2026-11-12(목)
it('주는 월요일부터 7칸이다', () => { expect(workoutStats([], new Date(2026, 10, 12)).week.map((d) => d.date)).toEqual(['2026-11-09', /*...*/ '2026-11-15']) })
it('오늘 안 했어도 어제까지 이어지면 연속이다', () => { /* 11-09,10,11 → streak 3 */ })
it('하루 빠지면 끊긴다', () => { /* 11-08, 11-10 → today 11-12 는 0, 11-11 이 있으면 1 */ })
it('하루 여러 번은 연속 하루, 이번 달 횟수는 건수다', () => {})
it('일요일 밤 기록은 그 주에 들어간다', () => { /* 11-15 23:59 → week 마지막 칸 done */ })
it('월이 바뀌면 이번 달 횟수는 새로 센다', () => { /* 10-31 기록, today 11-01 → monthCount 0, streak 1 */ })
// workouts.test.ts
it('기록에 현지 날짜와 루틴 이름을 남긴다', () => {})
it('같은 날 20건을 넘기지 않는다', () => {})
it('로그인 중 기록은 dirty 이고 그 사용자 것이다', () => {})
```

- [ ] **Step 2: 실패 확인** — `npx vitest run tests/unit/workouts.test.ts tests/unit/workoutStats.test.ts` FAIL
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 확인** — 같은 명령 + `tests/unit/routineMerge.test.ts`(기록 병합 테스트를 거기 더한다) PASS
- [ ] **Step 5: Commit** — `feat: 운동 기록 저장소와 통계를 추가한다`

---

### Task 6: 동기화 컨트롤러

**Files:**
- Create: `src/features/routines/SyncController.tsx` (루트 레이아웃에 붙는 'use client', 화면 없음 + 흡수 확인 시트)
- Create: `src/features/routines/syncStatus.ts` (상태 저장소 + `useSyncStatus()`)
- Modify: `src/app/layout.tsx` (`<SyncController />` 를 body 안에)
- Test: `tests/unit/syncStatus.test.ts`

**Interfaces:**
- Consumes: Task 2~5 전부
- Produces:
  - `type SyncStatus = { state: 'local' } | { state: 'synced' } | { state: 'pending' } | { state: 'rejected'; names: string[]; reason: string }`
  - `syncStatusFrom(routines: StoredRoutine[], workouts: WorkoutLog[], owner: string | null): SyncStatus` — 순수. owner null → local; 내 것 중 `syncError` 있음 → rejected; `dirty` 있음 → pending; 아니면 synced.
  - `useSyncStatus(): SyncStatus`
  - `retrySync(): void` — 상태 줄의 "다시 시도"가 부른다.
  - localStorage `health-shorts:sync:last-user` (마지막으로 본 사용자 id), `health-shorts:sync:kept-guest:<userId>` ("두기"를 고른 기록).

**동작(컨트롤러):**
1. 마운트 시 `createSupabaseBrowserClient()` 가 null 이면 아무것도 안 한다.
2. `auth.getUser()` 와 `onAuthStateChange` 로 현재 사용자 id 를 얻을 때마다 `classifySessionChange(lastUser, current)`:
   - signed-out / switched: 이전 사용자로 dirty 밀기(최대 3초, `Promise.race`) → `cleanupAfterSignOut` + `cleanupWorkoutsAfterSignOut`.
   - 그다음 `setActiveOwner(current)`, last-user 갱신.
   - current 가 있으면 당기기(fetch 두 개 → merge → replace) 후 dirty 밀기.
3. 밀기: 내 dirty 항목을 하나씩 push. ok → `dirty=false`; transient → 그대로, 재시도 예약(5s, 15s, 60s, 이후 60s); rejected → `syncError=reason`, `dirty=true` 유지하되 재시도 대상에서 뺀다(`syncError` 가 있으면 밀지 않음. Task 2 의 변경 함수가 `syncError=null` 로 되돌리므로 고치면 다시 밀린다).
4. 저장소 변경 구독 → 내 dirty 가 있으면 500ms 디바운스 후 밀기. `visibilitychange`(visible) 시 마지막 당기기 30초 이후면 당기기.
5. 로그인 상태 + `owner===null` 인 살아 있는 루틴 또는 기록이 있고 kept-guest 표시가 없으면 하단 시트: "로그인 전에 이 브라우저에서 만든 루틴 N개가 있어요. 내 계정으로 가져올까요?" (기록만 있으면 "운동 기록 N개") [가져오기](`BUTTON_PRIMARY`) [두기](`BUTTON_SECONDARY`). 가져오기 → adopt 두 개 → replace → 밀기. 두기 → kept-guest 기록. `data-testid="adopt-guest"`.

- [ ] **Step 1: 테스트** (`syncStatus.test.ts`) — `syncStatusFrom` 네 상태, rejected 가 pending 보다 우선, 다른 주인의 dirty 는 무시.
- [ ] **Step 2: 실패 확인** — `npx vitest run tests/unit/syncStatus.test.ts` FAIL
- [ ] **Step 3: 구현** — 순서 판단은 이미 테스트된 순수 함수만 부르고, 컨트롤러에는 배선만 둔다.
- [ ] **Step 4: 확인** — 단위 PASS, `npx tsc --noEmit`, `npm run test:e2e` 전체 PASS(Supabase 없음 → 컨트롤러 무동작, 회귀 없음)
- [ ] **Step 5: Commit** — `feat: 로그인 사용자의 루틴과 기록을 동기화한다`

---

### Task 7: 상태 줄 · 설정 문구

**Files:**
- Create: `src/features/routines/SyncStatusLine.tsx`
- Modify: `src/app/(tabs)/routines/page.tsx` (고정 문구를 `<SyncStatusLine />` 로), `src/features/account/AccountPanel.tsx` (87·104행 문구), `src/features/routines/RoutineFeed.tsx` (44행 문구)
- Test: `tests/e2e/search-feed.spec.ts`

**Interfaces:**
- Consumes: `useSyncStatus`, `retrySync` (Task 6)

**문구(정확히):**
- local: "루틴은 이 브라우저에만 저장돼요." + 링크 "로그인하면 다른 기기에서도 볼 수 있어요" → `/account`
- synced: "계정에 저장돼요. 다른 기기에서도 보여요."
- pending: "아직 계정에 저장되지 않았어요" + 버튼 "다시 시도"
- rejected: "{이름들} 루틴은 계정에 저장할 수 없어요 · {reason}"
- AccountPanel 로그인 상태: "루틴과 운동 기록이 계정에 저장돼요. 다른 기기에서 로그인해도 그대로 보여요." / 비로그인: "로그인하면 루틴과 운동 기록을 다른 기기에서도 볼 수 있어요."
- RoutineFeed 없음 안내: "루틴이 지워졌거나 다른 계정의 루틴이에요."
- 하이드레이션 전에는 local 문구를 그린다(서버 HTML 과 같다).

- [ ] **Step 1: E2E** — `test('루틴 화면이 로그인 안내를 보여준다')`: `/routines` 에서 "이 브라우저에만 저장돼요" 와 `/account` 링크가 보인다. 기존 테스트 중 옛 문구를 단정하는 것이 있으면 새 문구로 고친다.
- [ ] **Step 2: 실패 확인** — `npx playwright test -g "로그인 안내"` FAIL
- [ ] **Step 3: 구현**
- [ ] **Step 4: 확인** — `npm run test:e2e` 전체 PASS
- [ ] **Step 5: Commit** — `feat: 루틴 화면에 동기화 상태를 보여준다`

---

### Task 8: 운동 완료 기록 + 기록 카드

**Files:**
- Modify: `src/features/feed/ShortsFeed.tsx` (루틴 모드 완료 처리), `src/features/routines/RoutineFeed.tsx` (routine id 전달)
- Create: `src/features/workouts/WorkoutSummary.tsx`
- Modify: `src/app/(tabs)/routines/page.tsx` (`<WorkoutSummary />` 를 RoutineList 위에)
- Test: `tests/e2e/search-feed.spec.ts`

**Interfaces:**
- Consumes: `recordWorkout`, `useWorkouts` (Task 5), `workoutStats` (Task 5)
- `ShortsFeed` 에 `onRoutineComplete?: () => 'recorded' | 'limit' | 'failed'` 를 더한다(RoutineFeed 가 `() => recordWorkout(routine)` 을 넘긴다). ShortsFeed 는 한 마운트에서 한 번만 부른다(ref 플래그) — 마지막 슬라이드 종료(`endedIndex === videos.length - 1`) 또는 버튼.
- 루틴 모드의 마지막 슬라이드가 활성이면 플레이어 아래 오버레이에 버튼 "운동 완료"(`data-testid="finish-workout"`, `BUTTON_PRIMARY`)를 항상 보여준다. 누른 뒤/기록된 뒤에는 "오늘 운동을 기록했어요 🔥"로 바뀐다(`data-testid="workout-recorded"`). NextUpPanel 의 "루틴을 끝냈어요" 상태에도 같은 기록 결과 문구. 'limit' 이면 "오늘은 더 기록할 수 없어요", 'failed' 면 "기록을 저장하지 못했어요".
- `WorkoutSummary`: 기록이 없으면 `<p>` "루틴을 끝까지 하면 여기에 기록돼요." 있으면 카드(`cardClass`) — 월~일 7칸(운동한 날 `bg-accent`, 오늘은 `ring` 테두리, 요일 글자 월화수목금토일), "연속 {n}일", "이번 달 {n}회". `data-testid="workout-summary"`. 하이드레이션 전에는 아무것도 그리지 않는다.

- [ ] **Step 1: E2E**

```ts
test('루틴을 끝내면 이번 주 기록에 남는다', async ({ page }) => {
  // 영상 하나를 담은 루틴을 만들고(기존 테스트와 같은 절차) 재생한다.
  // ...
  await page.getByTestId('finish-workout').click()
  await expect(page.getByTestId('workout-recorded')).toBeVisible()
  // 한 재생에서 두 번 기록되지 않는다 — 버튼이 결과 문구로 바뀐다.
  await expect(page.getByTestId('finish-workout')).toHaveCount(0)
  await page.goto('/routines')
  await expect(page.getByTestId('workout-summary')).toContainText('연속 1일')
  await expect(page.getByTestId('workout-summary')).toContainText('이번 달 1회')
})
test('기록이 없으면 안내 한 줄만 보인다', async ({ page }) => { /* /routines 에서 "루틴을 끝까지 하면" */ })
```
- [ ] **Step 2: 실패 확인** — `npx playwright test -g "기록"` FAIL
- [ ] **Step 3: 구현**
- [ ] **Step 4: 확인** — `npm run test:e2e` 전체 PASS, `npm test` PASS
- [ ] **Step 5: Commit** — `feat: 루틴을 끝내면 운동 기록을 남기고 이번 주를 보여준다`

---

### Task 9: 휴식 시간 설정과 휴식 타이머

**Files:**
- Create: `src/features/routines/RestPicker.tsx` (루틴 화면의 운동별 설정 줄)
- Create: `src/features/routines/restTimer.ts` (순수 계산), `src/features/routines/RestTimer.tsx` (재생 중 버튼 + 패널)
- Modify: `src/features/routines/RoutineList.tsx` (항목마다 `<RestPicker />`), `src/features/feed/ShortsFeed.tsx` (루틴 모드에서 `<RestTimer />`), `src/features/routines/RoutineFeed.tsx`
- Test: `tests/unit/restTimer.test.ts`, `tests/e2e/search-feed.spec.ts`

**Interfaces:**
- Consumes: `REST`, `suggestRestSeconds`, `formatRest`, `clampRest` (Task 1); `setItemRest`, `RoutineItem` (Task 2)
- Produces:
  - `restTimer.ts`: `type RestRun = { endsAt: number; total: number }`; `startRest(seconds: number, now: number): RestRun`; `remaining(run: RestRun, now: number): number` (초, 올림, 0 하한); `adjustRest(run: RestRun, deltaSeconds: number, now: number): RestRun` — 남은 시간이 10초 미만이 되게 줄이지 않고(남은 ≥ 10 일 때만 −10 허용) 남은 시간이 300 을 넘지 않게 한다.
  - `ShortsFeed` 루틴 모드: 지금 슬라이드 운동의 `restSeconds` 를 알기 위해 `videos` 가 `RoutineItem[]` 일 수 있다 — prop `restFor?: (index: number) => number` 를 더하고 RoutineFeed 가 `(i) => routine.items[i].restSeconds` 를 넘긴다. 있으면 타이머를 그린다.

**RestPicker (루틴 화면):** 칩 세 개 `30초` `60초` `1분 30초`(`chipClass(active, 'sm')`, 버튼), 추천값 칩 옆에 작은 "추천" 글자(`text-accent`, 칩 안), `−` 값 `+` (`iconButtonClass('ghost','sm')`, aria-label "휴식 10초 줄이기"/"휴식 10초 늘리기", 10·300 에서 disabled). 값 표시는 `formatRest`. `data-testid="rest-picker"`.

**RestTimer (재생 중):** 플레이어 박스 아래 오버레이(제목 줄 위)에 버튼 "휴식 시작 · {formatRest(값)}" (`data-testid="start-rest"`). 누르면 패널(`data-testid="rest-panel"`): 큰 숫자 `m:ss`(`tabular`), `−10초` `+10초`, "건너뛰기". 250ms 마다 `remaining(run, Date.now())` 로 다시 그린다. 0 이 되면 Web Audio 로 0.2초 비프 1회(`AudioContext` 없으면 생략), `navigator.vibrate?.(200)`, "휴식 끝"을 2초 보이고 닫힌다. 슬라이드를 넘겨도 run 은 유지된다(상태를 ShortsFeed 수준에 둔다). 재생 중 조절은 저장하지 않는다. 비프용 `AudioContext` 는 "휴식 시작" 클릭 핸들러 안에서 만든다(모바일 자동재생 정책).

- [ ] **Step 1: 단위 테스트** (`restTimer.test.ts`)

```ts
it('끝나는 시각 기준으로 남은 시간을 센다', () => {
  const run = startRest(90, 0)
  expect(remaining(run, 0)).toBe(90)
  expect(remaining(run, 30_500)).toBe(60) // 올림
  expect(remaining(run, 200_000)).toBe(0) // 백그라운드에서 오래 있다 돌아옴
})
it('10초씩 늘리고 줄이되 범위를 지킨다', () => {
  expect(remaining(adjustRest(startRest(60, 0), 10, 0), 0)).toBe(70)
  expect(remaining(adjustRest(startRest(10, 0), -10, 0), 0)).toBe(10)
  expect(remaining(adjustRest(startRest(300, 0), 10, 0), 0)).toBe(300)
})
```

- [ ] **Step 2: E2E**

```ts
test('루틴의 운동마다 휴식 시간을 정하고 재생 중 타이머를 쓴다', async ({ page }) => {
  // 영상 하나로 루틴을 만든다(기존 테스트 절차). 모의 영상 제목에 맞는 추천값을 단정한다.
  await page.goto('/routines')
  const picker = page.getByTestId('rest-picker').first()
  await picker.getByRole('button', { name: '1분 30초' }).click()
  await picker.getByRole('button', { name: '휴식 10초 늘리기' }).click()
  await expect(picker).toContainText('1분 40초')
  await page.reload()
  await expect(page.getByTestId('rest-picker').first()).toContainText('1분 40초') // 저장됨

  await page.getByTestId('start-routine').click()
  await page.getByTestId('start-rest').click()
  await expect(page.getByTestId('rest-panel')).toContainText(/1:(40|39)/)
  await page.getByRole('button', { name: '건너뛰기' }).click()
  await expect(page.getByTestId('rest-panel')).toHaveCount(0)
})
test('검색 피드에는 휴식 버튼이 없다', async ({ page }) => { /* /feed?q=스쿼트 에서 start-rest 0개 */ })
```

- [ ] **Step 3: 실패 확인** — `npx vitest run tests/unit/restTimer.test.ts` 와 `npx playwright test -g "휴식"` FAIL
- [ ] **Step 4: 구현**
- [ ] **Step 5: 확인** — `npm test`, `npm run test:e2e` 전체 PASS. 개발 서버에서 휴식 시작 → 다른 탭으로 20초 → 돌아와 남은 시간이 맞는지 눈으로 본다.
- [ ] **Step 6: Commit** — `feat: 운동마다 휴식 시간을 정하고 루틴 재생 중 휴식 타이머를 쓴다`

---

### Task 10: 문서 · 마무리 검증

**Files:**
- Modify: `AGENTS.md` ("저장 매체를 아는 코드는 `features/routines/routines.ts` 안에만" → 로컬은 `routines.ts`·`workouts.ts`, 서버는 `routineSync.ts` 안에만. 사용자 데이터에 service 클라이언트 금지 한 줄)
- Modify: `README.md` 수동 확인 7번을 새 동작으로 바꾸고 동기화 항목 추가: ① 0004 실행 후 `npm run sync:check` 성공 ② 두 브라우저 같은 계정에서 담기·지우기·되돌리기가 포커스 전환 뒤 넘어간다 ③ 비로그인 루틴이 있는 상태로 로그인하면 가져오기 질문이 뜨고 가져오면 다른 브라우저에도 보인다 ④ 로그아웃하면 루틴이 사라지고 다시 로그인하면 돌아온다 ⑤ 루틴 완료 기록이 다른 브라우저 루틴 화면에 보인다 ⑥ 개발자도구 오프라인에서 담으면 "아직 계정에 저장되지 않았어요", 온라인 복귀 후 사라진다.

- [ ] **Step 1: 문서 수정**
- [ ] **Step 2: 전체 검증** — `npm run lint -- --max-warnings 0 && npx tsc --noEmit && npm test && npm run test:e2e` 모두 통과
- [ ] **Step 3: 개발 서버에서 비로그인으로 루틴 담기 → 재생 → 운동 완료 → 기록 카드를 눈으로 확인**
- [ ] **Step 4: Commit** — `docs: 동기화 수동 확인과 저장소 규칙을 갱신한다`
