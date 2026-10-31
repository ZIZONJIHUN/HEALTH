import { useSyncExternalStore } from 'react'
import { EMPTY_HISTORY, loadHistory, subscribeHistory, type History } from './history'

/** 서버 렌더에는 기록이 없다. 같은 상수 참조를 돌려줘야 하이드레이션 경고가 나지 않는다. */
function serverSnapshot(): History {
  return EMPTY_HISTORY
}

export function useHistory(): History {
  return useSyncExternalStore(subscribeHistory, loadHistory, serverSnapshot)
}
