import type { ShortVideo } from './types'

/**
 * 운동 루틴 저장소.
 *
 * 이 앱에는 로그인이 없다. 그래서 루틴은 브라우저 localStorage 에만 남고 기기 간에
 * 공유되지 않는다. 나중에 계정을 붙이면 이 파일의 함수 구현만 서버 호출로 바꾸면
 * 되도록, 저장 매체를 아는 코드를 전부 여기에 가둬 둔다.
 *
 * 영상 메타데이터(제목·썸네일·길이)를 통째로 저장하는 이유는 재생 때문이다.
 * 루틴을 시작할 때 YouTube 에 다시 물어보면 쿼터를 태우고, 하루 99회 상한에서는
 * 루틴 재생만으로도 상한을 넘길 수 있다.
 */

const STORAGE_KEY = 'health-shorts:routines:v1'

export type Routine = {
  id: string
  name: string
  createdAt: number
  items: ShortVideo[]
}

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

/**
 * useSyncExternalStore 는 스냅샷이 바뀌지 않았으면 같은 참조를 돌려받아야 한다.
 * 매번 JSON.parse 하면 참조가 계속 달라져서 무한 렌더에 빠진다.
 */
let cachedRaw: string | null = null
let cachedRoutines: Routine[] = []

/** 빈 목록은 참조를 고정한다 — useSyncExternalStore 가 참조로 변경을 판단한다. */
export const EMPTY_ROUTINES: Routine[] = []
const EMPTY = EMPTY_ROUTINES

function isRoutine(value: unknown): value is Routine {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<Routine>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.createdAt === 'number' &&
    Array.isArray(candidate.items)
  )
}

export function loadRoutines(): Routine[] {
  if (!isBrowser()) return EMPTY

  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(STORAGE_KEY)
  } catch {
    // 사파리 시크릿 모드 등에서 localStorage 접근 자체가 던진다.
    return EMPTY
  }

  if (raw === cachedRaw) return cachedRoutines

  cachedRaw = raw
  if (!raw) {
    cachedRoutines = EMPTY
    return cachedRoutines
  }

  try {
    const parsed: unknown = JSON.parse(raw)
    cachedRoutines = Array.isArray(parsed) ? parsed.filter(isRoutine) : EMPTY
  } catch {
    // 손상된 값 때문에 앱이 죽는 것보다 루틴을 잃는 편이 낫다.
    cachedRoutines = EMPTY
  }
  return cachedRoutines
}

const listeners = new Set<() => void>()

/**
 * 저장하고 같은 탭의 다른 컴포넌트에 변경을 알린다.
 * (localStorage 의 storage 이벤트는 다른 탭에만 간다.)
 *
 * 저장 성공 여부를 돌려주는 이유는 조용한 실패가 가장 나쁘기 때문이다. 예전에는
 * 예외를 삼켰는데, 그러면 용량 초과(사파리 시크릿 모드, 저장공간 부족)에서 화면에는
 * 담긴 것처럼 보이고 새로고침하면 사라진다. 사용자는 이유를 알 수 없다.
 */
function commit(routines: Routine[]): boolean {
  if (!isBrowser()) return false

  let saved = true
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(routines))
  } catch {
    saved = false
  }
  // 실패했어도 알린다. 구독자가 저장소를 다시 읽어 실제 상태(=저장 안 됨)를 그린다.
  for (const listener of listeners) listener()
  return saved
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

function nextId(): string {
  return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

export function createRoutine(name: string): Routine {
  const routine: Routine = {
    id: nextId(),
    name: name.trim() || '새 루틴',
    createdAt: Date.now(),
    items: [],
  }
  commit([...loadRoutines(), routine])
  return routine
}

export function renameRoutine(id: string, name: string): boolean {
  const trimmed = name.trim()
  if (!trimmed) return false
  return commit(
    loadRoutines().map((routine) =>
      routine.id === id ? { ...routine, name: trimmed } : routine,
    ),
  )
}

/**
 * 루틴을 지우고, 되돌리는 데 필요한 것(루틴 자체와 있던 자리)을 돌려준다.
 *
 * 로그인이 없어 저장 위치가 이 브라우저뿐이라 삭제에 복구 경로가 물리적으로 없다.
 * 확인 대화상자보다 실행 취소가 낫다 — 확인창은 매번 마찰을 주고 사람들은 곧 읽지 않고
 * 누르지만, 실행 취소는 실수했을 때만 개입한다.
 */
export function deleteRoutine(id: string): { routine: Routine; index: number } | null {
  const routines = loadRoutines()
  const index = routines.findIndex((routine) => routine.id === id)
  if (index === -1) return null

  const routine = routines[index]
  commit(routines.filter((item) => item.id !== id))
  return { routine, index }
}

/** deleteRoutine 을 되돌린다. 있던 자리에 되돌려 놓아야 목록 순서가 흔들리지 않는다. */
export function restoreRoutine(routine: Routine, index: number): boolean {
  const routines = loadRoutines()
  // 다른 탭에서 이미 되살아났거나 같은 id 가 있으면 중복을 만들지 않는다.
  if (routines.some((item) => item.id === routine.id)) return true

  const next = [...routines]
  next.splice(Math.min(Math.max(index, 0), next.length), 0, routine)
  return commit(next)
}

export function getRoutine(id: string): Routine | null {
  return loadRoutines().find((routine) => routine.id === id) ?? null
}

/**
 * 영상을 루틴에 담는다.
 *
 * 'failed' 는 저장이 안 된 상태다 — 용량 초과이거나, 방금 만든 루틴 자체가 저장되지
 * 않아 대상을 찾지 못한 경우다. 둘 다 사용자에게는 "담기지 않았다"로 같으므로
 * 한 값으로 묶는다. 예전에는 이 경우가 조용히 무시되어 화면에는 담긴 것처럼 보이고
 * 새로고침하면 사라졌다.
 */
export function addVideoToRoutine(
  routineId: string,
  video: ShortVideo,
): 'added' | 'duplicate' | 'failed' {
  const routines = loadRoutines()
  const target = routines.find((routine) => routine.id === routineId)
  if (!target) return 'failed'
  if (target.items.some((item) => item.id === video.id)) return 'duplicate'

  const next = routines.map((routine) =>
    routine.id === routineId ? { ...routine, items: [...routine.items, video] } : routine,
  )
  return commit(next) ? 'added' : 'failed'
}

export function removeVideoFromRoutine(routineId: string, videoId: string): boolean {
  return commit(
    loadRoutines().map((routine) =>
      routine.id === routineId
        ? { ...routine, items: routine.items.filter((item) => item.id !== videoId) }
        : routine,
    ),
  )
}

/** 운동 순서를 한 칸 옮긴다. 끝에서 더 옮기려 하면 아무 일도 하지 않는다. */
export function moveVideoInRoutine(
  routineId: string,
  videoId: string,
  direction: -1 | 1,
): boolean {
  return commit(
    loadRoutines().map((routine) => {
      if (routine.id !== routineId) return routine
      const from = routine.items.findIndex((item) => item.id === videoId)
      const to = from + direction
      if (from === -1 || to < 0 || to >= routine.items.length) return routine
      const items = [...routine.items]
      ;[items[from], items[to]] = [items[to], items[from]]
      return { ...routine, items }
    }),
  )
}

/** 테스트 전용. 저장소와 메모리 캐시를 함께 비운다. */
export function resetRoutinesForTest(): void {
  if (isBrowser()) window.localStorage.removeItem(STORAGE_KEY)
  cachedRaw = null
  cachedRoutines = EMPTY
  for (const listener of listeners) listener()
}
