import type { ShortVideo } from '@/lib/types'
import { clampRest, normalizeRest, suggestRestSeconds } from './rest'

/**
 * 운동 루틴 저장소.
 *
 * 화면은 localStorage 만 읽고 서버 동기화는 routineSync.ts 가 한다. 화면이 서버를
 * 기다리지 않아야 오프라인·비로그인에서도 루틴이 그대로 동작하고, 동기화 쪽은 이 파일이
 * 남긴 표시(owner·dirty·묘비)만 보고 무엇을 올릴지 정할 수 있다. 저장 매체를 아는 코드는
 * 전부 여기에 가둬 둔다.
 *
 * 영상 메타데이터(제목·썸네일·길이)를 통째로 저장하는 이유는 재생 때문이다.
 * 루틴을 시작할 때 YouTube 에 다시 물어보면 쿼터를 태우고, 하루 99회 상한에서는
 * 루틴 재생만으로도 상한을 넘길 수 있다.
 */

const STORAGE_KEY = 'health-shorts:routines:v2'
/** v1 은 지우지 않는다. 새 버전에 문제가 생겼을 때 되돌아갈 길로 남겨 둔다. */
const LEGACY_KEY = 'health-shorts:routines:v1'

/**
 * 서버(jsonb)와 localStorage 가 함께 지키는 상한. 이름 길이와 항목 수에 끝이 없으면
 * 한 사람이 저장공간을 채워 다른 루틴까지 저장 실패로 만들 수 있다.
 */
export const LIMITS = { nameLength: 60, items: 100, routines: 200 } as const

export type RoutineItem = ShortVideo & { restSeconds: number }

export type Routine = {
  id: string
  name: string
  createdAt: number
  items: RoutineItem[]
}

/**
 * 저장소에 실제로 남는 모양. 화면은 Routine 만 보고, 나머지는 동기화가 쓴다.
 * - owner: 누구의 루틴인가. null 은 로그인하지 않은 이 브라우저의 루틴.
 * - deletedAt: 묘비. 로그인 중 지운 루틴은 서버에 삭제를 전해야 하므로 바로 빼지 않는다.
 * - dirty: 서버에 아직 올리지 않은 변경이 있다.
 */
export type StoredRoutine = Routine & {
  updatedAt: number
  deletedAt: number | null
  owner: string | null
  dirty: boolean
  syncError: string | null
}

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

/** 빈 목록은 참조를 고정한다 — useSyncExternalStore 가 참조로 변경을 판단한다. */
export const EMPTY_ROUTINES: Routine[] = []
const EMPTY = EMPTY_ROUTINES
const EMPTY_STORED: StoredRoutine[] = []

/** 지금 화면의 주인. 로그인 상태는 이 파일이 모른다 — 인증 쪽이 알려 준다. */
let activeOwner: string | null = null

/**
 * 코드 포인트 단위로 자른다. slice 는 UTF-16 단위라 경계에 걸린 이모지를 반쪽(외톨이 서로게이트)
 * 으로 남기고, 서버의 char_length 는 코드 포인트를 세므로 길이 판단도 어긋난다.
 */
export function clampName(name: string, max: number = LIMITS.nameLength): string {
  const chars = Array.from(name)
  return chars.length <= max ? name : chars.slice(0, max).join('')
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** 저장된 항목을 믿을 수 있는 모양으로 되돌린다. 휴식 시간은 v1 에 없었다. */
function toItem(value: unknown): RoutineItem | null {
  if (!isObject(value) || typeof value.id !== 'string') return null
  const title = typeof value.title === 'string' ? value.title : ''
  return { ...(value as ShortVideo), restSeconds: normalizeRest(value.restSeconds, title) }
}

/**
 * 저장값 하나를 StoredRoutine 으로 만든다. 루틴 모양이 아니면 null.
 * v2 에 빠진 필드가 있으면(손으로 고쳤거나 중간 버전이 쓴 값) v1 변환과 같은 기본값을 쓴다.
 */
function toStored(value: unknown): StoredRoutine | null {
  if (!isObject(value)) return null
  const { id, name, createdAt, items } = value
  if (
    typeof id !== 'string' ||
    typeof name !== 'string' ||
    typeof createdAt !== 'number' ||
    !Array.isArray(items)
  ) {
    return null
  }
  return {
    id,
    name: clampName(name),
    createdAt,
    items: items.map(toItem).filter((item): item is RoutineItem => item !== null),
    updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : createdAt,
    deletedAt: typeof value.deletedAt === 'number' ? value.deletedAt : null,
    owner: typeof value.owner === 'string' ? value.owner : null,
    dirty: value.dirty === true,
    syncError: typeof value.syncError === 'string' ? value.syncError : null,
  }
}

function parse(raw: string | null): StoredRoutine[] {
  if (!raw) return EMPTY_STORED
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return EMPTY_STORED
    return parsed.map(toStored).filter((routine): routine is StoredRoutine => routine !== null)
  } catch {
    // 손상된 값 때문에 앱이 죽는 것보다 루틴을 잃는 편이 낫다.
    return EMPTY_STORED
  }
}

/**
 * v2 원문을 읽는다. v2 가 없고 v1 이 있으면 한 번 변환해 v2 에 쓴다.
 * v1 의 모든 루틴은 로그인 이전 것이므로 owner=null, dirty=false 다 — 로그인 후 그대로
 * 올릴지는 동기화 쪽이 사용자에게 묻는다.
 */
function readRaw(): string | null {
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (raw !== null) return raw

  const legacy = window.localStorage.getItem(LEGACY_KEY)
  if (legacy === null) return null

  const migrated = JSON.stringify(parse(legacy))
  try {
    window.localStorage.setItem(STORAGE_KEY, migrated)
  } catch {
    // 못 써도 이번 읽기는 변환본으로 보여 준다. 다음 읽기에서 다시 시도한다.
  }
  return migrated
}

/**
 * useSyncExternalStore 는 스냅샷이 바뀌지 않았으면 같은 참조를 돌려받아야 한다.
 * 매번 JSON.parse 하면 참조가 계속 달라져서 무한 렌더에 빠진다.
 * 보이는 목록은 주인에 따라 달라지므로 (원문, 주인) 둘 다로 캐시한다.
 */
let cachedRaw: string | null = null
let cachedStored: StoredRoutine[] = EMPTY_STORED
let cachedVisibleRaw: string | null = null
let cachedVisibleOwner: string | null = null
let cachedVisible: Routine[] = EMPTY

export function loadStoredRoutines(): StoredRoutine[] {
  if (!isBrowser()) return EMPTY_STORED

  let raw: string | null
  try {
    raw = readRaw()
  } catch {
    // 사파리 시크릿 모드 등에서 localStorage 접근 자체가 던진다.
    raw = null
  }

  if (raw !== cachedRaw) {
    cachedRaw = raw
    cachedStored = parse(raw)
  }
  return cachedStored
}

function isVisible(routine: StoredRoutine): boolean {
  return routine.owner === activeOwner && routine.deletedAt === null
}

/** 지금 주인의 살아 있는 루틴만. 다른 계정의 루틴과 묘비는 화면에 나오지 않는다. */
export function loadRoutines(): Routine[] {
  if (!isBrowser()) return EMPTY
  const stored = loadStoredRoutines()
  if (cachedRaw === cachedVisibleRaw && activeOwner === cachedVisibleOwner) {
    return cachedVisible
  }
  const visible = stored.filter(isVisible)
  cachedVisibleRaw = cachedRaw
  cachedVisibleOwner = activeOwner
  cachedVisible = visible.length ? visible : EMPTY
  return cachedVisible
}

const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of listeners) listener()
}

/**
 * 저장하고 같은 탭의 다른 컴포넌트에 변경을 알린다.
 * (localStorage 의 storage 이벤트는 다른 탭에만 간다.)
 *
 * 저장 성공 여부를 돌려주는 이유는 조용한 실패가 가장 나쁘기 때문이다. 예전에는
 * 예외를 삼켰는데, 그러면 용량 초과(사파리 시크릿 모드, 저장공간 부족)에서 화면에는
 * 담긴 것처럼 보이고 새로고침하면 사라진다. 사용자는 이유를 알 수 없다.
 */
function commit(routines: StoredRoutine[]): boolean {
  if (!isBrowser()) return false

  let saved = true
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(routines))
  } catch {
    saved = false
  }
  // 실패했어도 알린다. 구독자가 저장소를 다시 읽어 실제 상태(=저장 안 됨)를 그린다.
  notify()
  return saved
}

/** 동기화가 서버 결과를 반영할 때 쓴다. 통째로 저장하고 알린다. */
export function replaceStoredRoutines(next: StoredRoutine[]): boolean {
  return commit(next)
}

export function subscribeRoutines(listener: () => void): () => void {
  listeners.add(listener)
  // 다른 탭에서 바뀐 경우.
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

const ownerListeners = new Set<() => void>()

/**
 * 주인이 바뀔 때만 알림을 받는다. 운동 기록처럼 주인 기준으로 거르는 다른 저장소가 쓴다 —
 * 주인은 여기 하나에만 두어야 루틴과 기록이 서로 다른 계정을 보여 주는 일이 없다.
 */
export function onActiveOwnerChange(listener: () => void): () => void {
  ownerListeners.add(listener)
  return () => {
    ownerListeners.delete(listener)
  }
}

/**
 * 화면의 주인이 정해졌는가. 처음에는 false 다 — 로그인 사용자도 activeOwner 가 null 로
 * 시작하므로, 정해지기 전에 그리면 잠깐 손님 화면이 보이고 그사이 담은 것이 손님 루틴이 된다.
 * 동기화가 사용자를 알아내 setActiveOwner 를 처음 부를 때(로그아웃 상태면 null 로) 정해진다.
 * Supabase 설정이 없으면 물어볼 곳이 없으므로 컨트롤러가 곧바로 markOwnerResolved 를 부른다.
 */
let ownerResolved = false

export function isOwnerResolved(): boolean {
  return ownerResolved
}

/** 주인을 바꾸지 않고 "정해졌다" 만 알린다. 동기화를 켜지 않는 경로(설정 없음, 불러오기 실패)가 쓴다. */
export function markOwnerResolved(): void {
  if (ownerResolved) return
  ownerResolved = true
  notify()
}

/** 화면의 주인을 바꾼다. 보이는 목록이 통째로 바뀌므로 구독자에게 알린다. */
export function setActiveOwner(userId: string | null): void {
  const wasResolved = ownerResolved
  ownerResolved = true
  if (userId === activeOwner) {
    if (!wasResolved) notify()
    return
  }
  activeOwner = userId
  notify()
  for (const listener of ownerListeners) listener()
}

export function getActiveOwner(): string | null {
  return activeOwner
}

/**
 * 모든 변경이 남기는 표시. 로그인 중 변경만 dirty 다 — 비로그인 루틴은 올릴 곳이 없다.
 * syncError 를 지우는 이유: 사용자가 다시 고쳤으면 지난 실패는 더 이상 이 내용의 실패가 아니다.
 */
function touched(): Pick<StoredRoutine, 'updatedAt' | 'dirty' | 'syncError'> {
  return { updatedAt: Date.now(), dirty: activeOwner !== null, syncError: null }
}

function toRoutine(stored: StoredRoutine): Routine {
  return { id: stored.id, name: stored.name, createdAt: stored.createdAt, items: stored.items }
}

/**
 * 지금 주인의 살아 있는 루틴 하나를 바꾼다.
 * update 가 null 을 돌려주면 바뀐 것이 없다는 뜻이다 — 저장하지 않아야 dirty 가 헛되이
 * 서지 않는다. 대상이 없으면 false.
 */
function updateRoutine(
  id: string,
  update: (routine: StoredRoutine) => StoredRoutine | null,
): boolean {
  const stored = loadStoredRoutines()
  const index = stored.findIndex((routine) => routine.id === id && isVisible(routine))
  if (index === -1) return false

  const changed = update(stored[index])
  if (!changed) return true
  const next = [...stored]
  next[index] = { ...changed, ...touched() }
  return commit(next)
}

function nextId(): string {
  return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

/** 살아 있는 내 루틴이 상한에 닿았으면 null. 묘비는 세지 않는다. */
export function createRoutine(name: string): Routine | null {
  const stored = loadStoredRoutines()
  if (stored.filter(isVisible).length >= LIMITS.routines) return null

  const now = Date.now()
  const routine: StoredRoutine = {
    id: nextId(),
    name: clampName(name.trim() || '새 루틴'),
    createdAt: now,
    items: [],
    owner: activeOwner,
    deletedAt: null,
    ...touched(),
  }
  commit([...stored, routine])
  return toRoutine(routine)
}

export function renameRoutine(id: string, name: string): boolean {
  const trimmed = clampName(name.trim())
  if (!trimmed) return false
  return updateRoutine(id, (routine) =>
    routine.name === trimmed ? null : { ...routine, name: trimmed },
  )
}

/**
 * 루틴을 지우고, 되돌리는 데 필요한 것(루틴 자체와 화면 목록에서 있던 자리)을 돌려준다.
 *
 * 비로그인 루틴은 저장 위치가 이 브라우저뿐이라 배열에서 바로 뺀다. 로그인 중이면
 * 묘비를 남긴다 — 서버에 삭제를 전해야 하고, 그 전에 빼 버리면 다음 동기화가 서버의
 * 사본을 다시 내려받아 지운 루틴이 되살아난다.
 *
 * 확인 대화상자보다 실행 취소가 낫다 — 확인창은 매번 마찰을 주고 사람들은 곧 읽지 않고
 * 누르지만, 실행 취소는 실수했을 때만 개입한다.
 */
export function deleteRoutine(
  id: string,
): { routine: Routine; index: number; owner: string | null } | null {
  const visible = loadRoutines()
  const index = visible.findIndex((routine) => routine.id === id)
  if (index === -1) return null

  const stored = loadStoredRoutines()
  const target = stored.find((routine) => routine.id === id && isVisible(routine))!
  const next =
    target.owner === null
      ? stored.filter((routine) => routine !== target)
      : stored.map((routine) =>
          // 묘비는 항목을 비운다. 되돌리기는 돌려준 routine 으로 다시 짓는다 — 묘비에 내용이
          // 남으면 그 내용 때문에 서버가 거절했을 때 보이지 않는 루틴이 거절 상태로 계속 남는다.
          routine === target
            ? { ...routine, items: [], deletedAt: Date.now(), ...touched() }
            : routine,
        )
  commit(next)
  return { routine: toRoutine(target), index, owner: target.owner }
}

/**
 * deleteRoutine 을 되돌린다. 있던 자리에 되돌려 놓아야 목록 순서가 흔들리지 않는다.
 * 묘비가 남아 있으면 그 자리에서 되살린다(묘비는 배열 위치를 그대로 지키고 있다).
 *
 * owner 는 지울 때의 주인이다. 되돌리기 안내는 몇 초 떠 있어서 그사이 로그아웃·다른
 * 계정 로그인이 끼어들 수 있다. 주인이 다르면 거부한다(false) — 그대로 되살리면 남의
 * 루틴이 지금 계정에 dirty 로 올라가거나, 손님 루틴이 가져오기 동의 없이 계정에 들어간다.
 */
export function restoreRoutine(
  routine: Routine,
  index: number,
  owner: string | null,
): boolean {
  if (owner !== activeOwner) return false
  const stored = loadStoredRoutines()
  const existing = stored.findIndex((item) => item.id === routine.id)
  if (existing !== -1 && stored[existing].owner !== activeOwner) return false
  // 묘비는 항목을 비워 둔다(deleteRoutine). 내용은 넘겨받은 routine 에서 되살린다.
  const revived: StoredRoutine = {
    id: routine.id,
    name: clampName(routine.name),
    createdAt: routine.createdAt,
    items: routine.items,
    owner: activeOwner,
    deletedAt: null,
    ...touched(),
  }

  if (existing !== -1) {
    // 다른 탭에서 이미 되살아났으면 중복을 만들지 않는다.
    if (stored[existing].deletedAt === null) return true
    const next = [...stored]
    next[existing] = revived
    return commit(next)
  }

  // index 는 화면 목록 기준이다. 저장 배열에는 다른 주인의 루틴과 묘비가 섞여 있으므로
  // 화면에서 그 자리에 있던 루틴 앞에 끼워 넣는다.
  const visible = stored.filter(isVisible)
  const anchor = visible[Math.max(index, 0)]
  const at = anchor ? stored.indexOf(anchor) : stored.length
  const next = [...stored]
  next.splice(at, 0, revived)
  return commit(next)
}

export function getRoutine(id: string): Routine | null {
  return loadRoutines().find((routine) => routine.id === id) ?? null
}

/**
 * 영상을 루틴에 담는다. 휴식 시간은 제목으로 고른 추천값으로 채운다.
 *
 * 'failed' 는 저장이 안 된 상태다 — 용량 초과이거나, 방금 만든 루틴 자체가 저장되지
 * 않아 대상을 찾지 못한 경우다. 둘 다 사용자에게는 "담기지 않았다"로 같으므로
 * 한 값으로 묶는다. 예전에는 이 경우가 조용히 무시되어 화면에는 담긴 것처럼 보이고
 * 새로고침하면 사라졌다. 'full' 은 루틴당 상한에 닿은 경우다.
 */
export function addVideoToRoutine(
  routineId: string,
  video: ShortVideo,
): 'added' | 'duplicate' | 'full' | 'failed' {
  const target = getRoutine(routineId)
  if (!target) return 'failed'
  if (target.items.some((item) => item.id === video.id)) return 'duplicate'
  if (target.items.length >= LIMITS.items) return 'full'

  const item: RoutineItem = { ...video, restSeconds: suggestRestSeconds(video.title) }
  const saved = updateRoutine(routineId, (routine) => ({
    ...routine,
    items: [...routine.items, item],
  }))
  return saved ? 'added' : 'failed'
}

export function removeVideoFromRoutine(routineId: string, videoId: string): boolean {
  return updateRoutine(routineId, (routine) => {
    const items = routine.items.filter((item) => item.id !== videoId)
    return items.length === routine.items.length ? null : { ...routine, items }
  })
}

/** 운동 순서를 한 칸 옮긴다. 끝에서 더 옮기려 하면 아무 일도 하지 않는다. */
export function moveVideoInRoutine(
  routineId: string,
  videoId: string,
  direction: -1 | 1,
): boolean {
  return updateRoutine(routineId, (routine) => {
    const from = routine.items.findIndex((item) => item.id === videoId)
    const to = from + direction
    if (from === -1 || to < 0 || to >= routine.items.length) return null
    const items = [...routine.items]
    ;[items[from], items[to]] = [items[to], items[from]]
    return { ...routine, items }
  })
}

/** 운동 하나의 휴식 시간을 바꾼다. 10초 단위로 맞추고 허용 범위로 자른다. 대상이 없으면 false. */
export function setItemRest(routineId: string, videoId: string, seconds: number): boolean {
  const target = getRoutine(routineId)
  if (!target?.items.some((item) => item.id === videoId)) return false

  const restSeconds = clampRest(seconds)
  return updateRoutine(routineId, (routine) => {
    const current = routine.items.find((item) => item.id === videoId)
    if (!current || current.restSeconds === restSeconds) return null
    return {
      ...routine,
      items: routine.items.map((item) => (item.id === videoId ? { ...item, restSeconds } : item)),
    }
  })
}

/** 테스트 전용. 저장소(v1·v2), 메모리 캐시, 화면 주인을 함께 되돌린다. */
export function resetRoutinesForTest(): void {
  if (isBrowser()) {
    window.localStorage.removeItem(STORAGE_KEY)
    window.localStorage.removeItem(LEGACY_KEY)
  }
  activeOwner = null
  ownerResolved = false
  cachedRaw = null
  cachedStored = EMPTY_STORED
  cachedVisibleRaw = null
  cachedVisibleOwner = null
  cachedVisible = EMPTY
  notify()
}
