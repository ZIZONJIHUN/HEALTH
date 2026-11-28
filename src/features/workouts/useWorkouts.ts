import { useSyncExternalStore } from 'react'
import { EMPTY_WORKOUTS, loadWorkouts, subscribeWorkouts, type WorkoutLog } from './workouts'

/**
 * 운동 기록은 localStorage 에만 있으므로 서버 렌더에서는 항상 빈 목록이다.
 * 서버 스냅샷으로 같은 상수 참조를 돌려줘야 하이드레이션 경고가 나지 않는다.
 */
function serverSnapshot(): WorkoutLog[] {
  return EMPTY_WORKOUTS
}

export function useWorkouts(): WorkoutLog[] {
  return useSyncExternalStore(subscribeWorkouts, loadWorkouts, serverSnapshot)
}
