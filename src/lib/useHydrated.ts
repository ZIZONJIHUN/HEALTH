import { useSyncExternalStore } from 'react'

/** 구독할 외부 소스가 없다. 스냅샷 두 개의 차이만 쓴다. */
const neverChanges = () => () => {}
const onClient = () => true
const onServer = () => false

/**
 * 서버 렌더와 하이드레이션 시점에는 false, 그 직후부터 true.
 *
 * 루틴은 localStorage 에만 있어서 서버가 그린 HTML 에는 항상 "없음"이다. 그대로 두면
 * 루틴이 있는 사용자에게도 "루틴이 없어요"가 한 프레임 번쩍인다. 이 값으로 그 순간에는
 * 스켈레톤을 보여준다.
 *
 * useEffect 로 플래그를 세우는 방식이 더 익숙하지만, 그건 렌더를 한 번 더 유발한다는
 * 이유로 react-hooks 린트가 막는다. useSyncExternalStore 는 하이드레이션 경계를
 * React 가 직접 알려주는 정식 경로다.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(neverChanges, onClient, onServer)
}
