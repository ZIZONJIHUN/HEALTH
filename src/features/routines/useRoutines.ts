import { useSyncExternalStore } from 'react'
import {
  EMPTY_ROUTINES,
  isOwnerResolved,
  loadRoutines,
  subscribeRoutines,
  type Routine,
} from './routines'

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

function notResolvedOnServer(): boolean {
  return false
}

/**
 * 화면의 주인(로그인 사용자 또는 손님)이 정해졌는가. 정해지기 전에는 하이드레이션 전과 똑같이
 * 다룬다 — 로그인 사용자에게 손님 화면을 잠깐 보여 주지 않게.
 */
export function useOwnerResolved(): boolean {
  return useSyncExternalStore(subscribeRoutines, isOwnerResolved, notResolvedOnServer)
}
