'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { BUTTON_PRIMARY, BUTTON_SECONDARY } from '@/components/ui/Button'
import { cardClass } from '@/components/ui/Card'
import { supabasePublicConfig } from '@/lib/supabase/env'
import {
  loadStoredWorkouts,
  replaceStoredWorkouts,
  subscribeWorkouts,
  type WorkoutLog,
} from '@/features/workouts/workouts'
import { adoptGuestRoutines, adoptGuestWorkouts } from './merge'
import { fetchRoutines, fetchWorkouts, pushRoutine, pushWorkout } from './routineSync'
import {
  getActiveOwner,
  loadStoredRoutines,
  markOwnerResolved,
  onActiveOwnerChange,
  replaceStoredRoutines,
  subscribeRoutines,
  type StoredRoutine,
} from './routines'
import { startSync, type SyncAuth, type SyncIo } from './syncEngine'
import { guestPrompt, userFromGetUser } from './syncPlan'
import { isGuestKept, markGuestKept, retrySync } from './syncStatus'

/**
 * 로그인 사용자의 루틴·기록을 서버와 맞춘다. 루트 레이아웃에 붙는다 — 피드에서도 담기와 기록이
 * 일어나므로 탭 레이아웃만으로는 부족하다(설계 4.6).
 *
 * 여기에는 배선만 둔다. 순서·동시성은 syncEngine.ts, 판단은 syncPlan.ts·merge.ts 가 맡는다.
 *
 * Supabase 설정이 없으면 아무것도 하지 않는다(E2E 가 이 상태로 돈다). 설정이 있을 때만
 * 클라이언트를 동적으로 불러온다 — 모든 화면의 첫 번들에 supabase-js 를 싣지 않기 위해서다.
 */

/** 실제 Supabase 클라이언트를 엔진이 쓰는 모양으로 묶는다. 브라우저 anon 클라이언트만 넘어온다(RLS). */
function bindClient(client: SupabaseClient): { auth: SyncAuth; io: SyncIo } {
  return {
    auth: {
      onUserChange(listener) {
        const { data } = client.auth.onAuthStateChange((_event, session) => {
          listener(session?.user.id ?? null)
        })
        return () => data.subscription.unsubscribe()
      },
      async getUser() {
        const { data, error } = await client.auth.getUser()
        // 세션 없음·토큰 거절만 로그아웃이다. 오프라인·서버 오류처럼 확인을 못 한 것은 모름.
        return userFromGetUser(data.user?.id ?? null, error)
      },
    },
    io: {
      fetchRoutines: (userId) => fetchRoutines(client, userId),
      fetchWorkouts: (userId) => fetchWorkouts(client, userId),
      pushRoutine: (userId, routine, position) => pushRoutine(client, userId, routine, position),
      pushWorkout: (userId, log) => pushWorkout(client, userId, log),
    },
  }
}

export default function SyncController() {
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    // 동기화를 켜지 않는 경로에서는 물어볼 사용자가 없다 — 손님으로 정해졌다고 바로 알린다.
    // 켜는 경로에서는 엔진이 사용자를 알아내 setActiveOwner 를 처음 부를 때 정해진다.
    if (!supabasePublicConfig()) {
      markOwnerResolved()
      return
    }
    let stop: (() => void) | null = null
    let cancelled = false
    import('@/lib/supabase/browser')
      .then(({ createSupabaseBrowserClient }) => {
        if (cancelled) return
        const client = createSupabaseBrowserClient()
        if (!client) {
          markOwnerResolved()
          return
        }
        const { auth, io } = bindClient(client)
        stop = startSync(auth, io)
        setEnabled(true)
      })
      .catch((error: unknown) => {
        // 청크를 받지 못했다(배포 직후 옛 번들, 오프라인 첫 방문). 동기화 없이 손님처럼 쓴다.
        console.error('[sync] 동기화 모듈을 불러오지 못했어요 — 동기화를 끕니다', error)
        if (!cancelled) markOwnerResolved()
      })
    return () => {
      cancelled = true
      stop?.()
    }
  }, [])

  return enabled ? <AdoptGuestSheet /> : null
}

const NO_ROUTINES: StoredRoutine[] = []
const NO_WORKOUTS: WorkoutLog[] = []

function serverOwner(): string | null {
  return null
}

/**
 * 로그인 전에 만든 손님 루틴·기록을 계정으로 가져올지 묻는다(설계 4.4).
 * 묻지 않고 흡수하면 공용 PC 에서 손님이 만든 것이 다음 사람 계정으로 영구히 들어간다.
 * 막아서지 않도록 모달이 아니라 탭 바 위의 시트로 둔다 — 답하지 않아도 앱은 그대로 쓴다.
 */
function AdoptGuestSheet() {
  const owner = useSyncExternalStore(onActiveOwnerChange, getActiveOwner, serverOwner)
  const routines = useSyncExternalStore(subscribeRoutines, loadStoredRoutines, () => NO_ROUTINES)
  const workouts = useSyncExternalStore(subscribeWorkouts, loadStoredWorkouts, () => NO_WORKOUTS)
  // "두기" 기록은 localStorage 에 있다. 누른 뒤 다시 그리게 하는 용도.
  const [, setKeptVersion] = useState(0)
  const primary = useRef<HTMLButtonElement>(null)

  const message = owner && !isGuestKept(owner) ? guestPrompt(routines, workouts) : null
  const open = message !== null

  useEffect(() => {
    if (open) primary.current?.focus()
  }, [open])

  if (!open || !owner) return null

  function adopt(userId: string) {
    // 그사이 다른 계정으로 바뀌었으면 손님 것을 엉뚱한 계정에 넣지 않는다.
    if (getActiveOwner() !== userId) return
    replaceStoredRoutines(adoptGuestRoutines(loadStoredRoutines(), userId))
    replaceStoredWorkouts(adoptGuestWorkouts(loadStoredWorkouts(), userId))
    retrySync()
  }

  function keep(userId: string) {
    markGuestKept(userId)
    setKeptVersion((version) => version + 1)
  }

  return (
    <div
      role="dialog"
      aria-labelledby="adopt-guest-title"
      data-testid="adopt-guest"
      className={cardClass(
        'solid',
        'fixed inset-x-4 bottom-[calc(4rem+env(safe-area-inset-bottom)+0.75rem)] z-50 mx-auto max-w-md p-5 shadow-pop md:bottom-6',
      )}
    >
      <p id="adopt-guest-title" className="text-[15px] leading-relaxed font-semibold text-text">
        {message}
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={() => keep(owner)} className={BUTTON_SECONDARY}>
          두기
        </button>
        <button
          ref={primary}
          type="button"
          onClick={() => adopt(owner)}
          className={BUTTON_PRIMARY}
        >
          가져오기
        </button>
      </div>
    </div>
  )
}
