import { getActiveOwner, onActiveOwnerChange } from '@/features/routines/routines'
import { toLocalDate } from './stats'

/**
 * 운동 기록 저장소.
 *
 * 루틴 저장소와 같은 원칙이다 — 화면은 localStorage 만 읽고, 서버 동기화는 이 파일이 남긴
 * 표시(owner·dirty)만 보고 무엇을 올릴지 정한다. 저장 매체를 아는 코드는 여기에만 둔다.
 *
 * 기록은 추가만 된다(편집·삭제 없음). 그래서 묘비도 updatedAt 도 없고, 병합은 id 합집합이다.
 * 화면의 주인은 루틴 저장소가 가진 것 하나를 같이 쓴다 — 둘이 따로 들면 루틴과 기록이 서로
 * 다른 계정을 보여 주는 순간이 생긴다.
 */

const STORAGE_KEY = 'health-shorts:workouts:v1'

/**
 * 서버(0004 마이그레이션)와 같은 값. 하루 20번 넘게 루틴을 끝내는 것은 사람이 아니다 —
 * 로컬에서도 같은 값으로 막아야 서버가 거절할 기록을 애초에 쌓지 않는다.
 */
export const WORKOUT_LIMITS = { perDay: 20, routineNameLength: 60 } as const

/**
 * - localDate: 기록한 기기의 달력 날짜(YYYY-MM-DD). 통계와 하루 상한은 이 값으로 센다.
 * - routineName: 기록 시점의 이름을 복사해 둔다. 루틴을 지우거나 이름을 바꿔도 기록이 뜻을 잃지 않는다.
 * - owner: 기록 시점의 화면 주인. null 은 로그인하지 않은 이 브라우저의 기록.
 * - dirty: 서버에 아직 올리지 않았다.
 */
export type WorkoutLog = {
  id: string
  routineId: string
  routineName: string
  completedAt: number
  localDate: string
  owner: string | null
  dirty: boolean
}

const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

/** 빈 목록은 참조를 고정한다 — useSyncExternalStore 가 참조로 변경을 판단한다. */
export const EMPTY_WORKOUTS: WorkoutLog[] = []
const EMPTY_STORED: WorkoutLog[] = []

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** 저장값 하나를 믿을 수 있는 모양으로. 날짜 모양이 틀리면 통계가 엉뚱하게 세므로 버린다. */
function toLog(value: unknown): WorkoutLog | null {
  if (!isObject(value)) return null
  const { id, routineId, routineName, completedAt, localDate } = value
  if (
    typeof id !== 'string' ||
    typeof routineId !== 'string' ||
    typeof routineName !== 'string' ||
    typeof completedAt !== 'number' ||
    typeof localDate !== 'string' ||
    !LOCAL_DATE.test(localDate)
  ) {
    return null
  }
  return {
    id,
    routineId,
    routineName,
    completedAt,
    localDate,
    owner: typeof value.owner === 'string' ? value.owner : null,
    dirty: value.dirty === true,
  }
}

function parse(raw: string | null): WorkoutLog[] {
  if (!raw) return EMPTY_STORED
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return EMPTY_STORED
    return parsed.map(toLog).filter((log): log is WorkoutLog => log !== null)
  } catch {
    // 손상된 값 때문에 앱이 죽는 것보다 기록을 잃는 편이 낫다.
    return EMPTY_STORED
  }
}

/**
 * useSyncExternalStore 는 바뀌지 않은 스냅샷에 같은 참조를 받아야 한다. 매번 JSON.parse 하면
 * 무한 렌더에 빠진다. 보이는 목록은 주인에 따라 달라지므로 (원문, 주인) 둘 다로 캐시한다.
 */
let cachedRaw: string | null = null
let cachedStored: WorkoutLog[] = EMPTY_STORED
let cachedVisibleRaw: string | null = null
let cachedVisibleOwner: string | null = null
let cachedVisible: WorkoutLog[] = EMPTY_WORKOUTS

export function loadStoredWorkouts(): WorkoutLog[] {
  if (!isBrowser()) return EMPTY_STORED

  let raw: string | null
  try {
    raw = window.localStorage.getItem(STORAGE_KEY)
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

/** 지금 주인의 기록만. 다른 계정의 기록은 화면과 통계에 나오지 않는다. */
export function loadWorkouts(): WorkoutLog[] {
  if (!isBrowser()) return EMPTY_WORKOUTS
  const stored = loadStoredWorkouts()
  const owner = getActiveOwner()
  if (cachedRaw === cachedVisibleRaw && owner === cachedVisibleOwner) return cachedVisible

  const visible = stored.filter((log) => log.owner === owner)
  cachedVisibleRaw = cachedRaw
  cachedVisibleOwner = owner
  cachedVisible = visible.length ? visible : EMPTY_WORKOUTS
  return cachedVisible
}

const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of listeners) listener()
}

/**
 * 저장하고 같은 탭의 구독자에게 알린다. 성공 여부를 돌려준다 — 용량 초과에서 조용히 실패하면
 * 화면에는 기록된 것처럼 보이다가 새로고침하면 사라진다.
 */
function commit(logs: WorkoutLog[]): boolean {
  if (!isBrowser()) return false

  let saved = true
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(logs))
  } catch {
    saved = false
  }
  // 실패했어도 알린다. 구독자가 다시 읽어 실제 상태(=저장 안 됨)를 그린다.
  notify()
  return saved
}

/** 동기화가 서버 결과를 반영할 때 쓴다. 통째로 저장하고 알린다. */
export function replaceStoredWorkouts(next: WorkoutLog[]): boolean {
  return commit(next)
}

/**
 * 저장 변경(같은 탭·다른 탭)과 화면 주인 변경을 함께 구독한다. 주인이 바뀌면 원문은 그대로여도
 * 보이는 기록이 통째로 바뀐다.
 */
export function subscribeWorkouts(listener: () => void): () => void {
  listeners.add(listener)
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener()
  }
  window.addEventListener('storage', onStorage)
  const offOwner = onActiveOwnerChange(listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
    offOwner()
  }
}

/** 루틴 id 와 접두어를 달리 둔다 — 로그나 서버 표에서 무엇의 id 인지 바로 보이게. */
function nextId(): string {
  return `w${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

/**
 * 루틴 한 번 끝낸 것을 기록한다.
 *
 * owner 는 기록 시점의 화면 주인이다. 로그인 중 기록만 dirty — 손님 기록은 올릴 곳이 없고,
 * 로그인 후 가져올지는 동기화 쪽이 루틴과 함께 묻는다.
 * 'limit' 은 같은 주인·같은 날 20건에 닿은 경우로, 그냥 기록하지 않는다.
 * 'failed' 는 저장이 안 된 경우다(용량 초과 등).
 */
export function recordWorkout(
  routine: { id: string; name: string },
  now: Date = new Date(),
): 'recorded' | 'limit' | 'failed' {
  const owner = getActiveOwner()
  const localDate = toLocalDate(now)
  const stored = loadStoredWorkouts()

  const sameDay = stored.filter((log) => log.owner === owner && log.localDate === localDate)
  if (sameDay.length >= WORKOUT_LIMITS.perDay) return 'limit'

  const log: WorkoutLog = {
    id: nextId(),
    routineId: routine.id,
    routineName: routine.name.slice(0, WORKOUT_LIMITS.routineNameLength),
    completedAt: now.getTime(),
    localDate,
    owner,
    dirty: owner !== null,
  }
  return commit([...stored, log]) ? 'recorded' : 'failed'
}
