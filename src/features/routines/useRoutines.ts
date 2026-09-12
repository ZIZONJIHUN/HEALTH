import { useSyncExternalStore } from 'react'
import { EMPTY_ROUTINES, loadRoutines, subscribeRoutines, type Routine } from './routines'

/**
 * 루틴은 localStorage 에만 있으므로 서버 렌더에서는 항상 빈 목록이다.
 * 서버 스냅샷으로 같은 상수 참조를 돌려줘야 하이드레이션 경고가 나지 않는다.
 */
function serverSnapshot(): Routine[] {
  return EMPTY_ROUTINES
}

export function useRoutines(): Routine[] {
  return useSyncExternalStore(subscribeRoutines, loadRoutines, serverSnapshot)
}
