'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { BUTTON_PRIMARY, BUTTON_SECONDARY } from '@/components/ui/Button'
import { cardClass } from '@/components/ui/Card'
import { ICON_WEIGHT, WarningCircle } from '@/components/ui/icons'
import { flushBeforeSignOut, hasUnsavedChanges } from '@/features/routines/syncStatus'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import type { AccountUser } from './session'

/**
 * "내 정보" 화면 본문.
 *
 * 구글 프로필 사진을 쓰지 않는다. 이메일 첫 글자로 원을 그린다 —
 * lh3.googleusercontent.com 을 CSP img-src 에 열지 않아도 되고, 페이지마다
 * 구글로 요청이 나가지 않는다. 얻는 것에 비해 붙는 것이 많다.
 */
export default function AccountPanel({
  user,
  notice,
}: {
  user: AccountUser | null
  /** OAuth 콜백이 실패를 알릴 때 쓰는 값. */
  notice: 'failed' | 'unconfigured' | null
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  // 밀기 뒤에도 못 올린 변경이 남았다 — 로그아웃 전에 한 번 묻는다(설계 4.4).
  const [confirming, setConfirming] = useState(false)
  const configured = createSupabaseBrowserClient() !== null

  async function signIn() {
    const supabase = createSupabaseBrowserClient()
    if (!supabase) return
    setBusy(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/account` },
    })
    // 성공하면 구글로 떠나므로 여기 도달하지 않는다.
    if (error) setBusy(false)
  }

  async function signOut() {
    const supabase = createSupabaseBrowserClient()
    if (!supabase) return
    setBusy(true)
    try {
      // 세션이 살아 있을 때 못 올린 변경을 먼저 밀어 본다(최대 3초). 로그아웃 뒤에는 밀 수 없다.
      await flushBeforeSignOut()
      // 그래도 남았으면(오프라인, 서버 거절) 로그아웃하면 이 브라우저에만 남는다. 묻고 멈춘다.
      if (hasUnsavedChanges()) {
        setConfirming(true)
        return
      }
      await supabase.auth.signOut()
      // 서버 컴포넌트가 들고 있는 사용자 정보를 다시 읽게 한다.
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  /** 확인에서 "그래도 로그아웃" 을 골랐다. 남은 변경은 dirty 로 이 브라우저에 남는다. */
  async function signOutAnyway() {
    const supabase = createSupabaseBrowserClient()
    if (!supabase) return
    setBusy(true)
    try {
      await supabase.auth.signOut()
      setConfirming(false)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={cardClass('solid', 'p-6 sm:p-8')}>
      {notice ? (
        <p
          role="alert"
          data-testid="account-notice"
          className="mb-5 flex items-start gap-2 rounded-xl border border-danger/35 bg-danger/10 px-4 py-3 text-[13px] leading-relaxed text-text"
        >
          <WarningCircle
            size={16}
            weight={ICON_WEIGHT}
            aria-hidden
            className="mt-px shrink-0 text-danger"
          />
          {notice === 'failed'
            ? '로그인이 완료되지 않았어요. 다시 시도해 주세요.'
            : '로그인이 아직 설정되지 않았어요.'}
        </p>
      ) : null}

      {user ? (
        <>
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-lg font-bold text-accent-fg"
            >
              {(user.email ?? '?').slice(0, 1).toUpperCase()}
            </span>
            <p className="min-w-0 truncate text-[15px] font-semibold text-text">
              {user.email ?? '로그인됨'}
            </p>
          </div>

          <p className="mt-4 text-sm leading-relaxed text-muted">
            루틴과 운동 기록이 계정에 저장돼요. 다른 기기에서 로그인해도 그대로 보여요.
          </p>

          {confirming ? (
            <div
              role="group"
              aria-labelledby="sign-out-confirm-text"
              data-testid="sign-out-confirm"
              className="mt-5 rounded-xl border border-border bg-surface2 p-4"
            >
              <p id="sign-out-confirm-text" className="text-sm leading-relaxed text-text">
                아직 저장되지 않은 변경이 있어요. 지금 로그아웃하면 이 브라우저에만 남아요.
              </p>
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  data-testid="sign-out-anyway"
                  disabled={busy}
                  onClick={signOutAnyway}
                  className={BUTTON_SECONDARY}
                >
                  그래도 로그아웃
                </button>
                <button
                  type="button"
                  autoFocus
                  disabled={busy}
                  onClick={() => setConfirming(false)}
                  className={BUTTON_PRIMARY}
                >
                  취소
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              data-testid="sign-out"
              disabled={busy}
              onClick={signOut}
              className={`${BUTTON_SECONDARY} mt-5`}
            >
              로그아웃
            </button>
          )}
        </>
      ) : (
        <>
          <p className="text-[15px] font-semibold text-text">아직 로그인하지 않았어요.</p>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            로그인하면 루틴과 운동 기록을 다른 기기에서도 볼 수 있어요.
          </p>

          <button
            type="button"
            data-testid="sign-in"
            disabled={!configured || busy}
            onClick={signIn}
            className={`${BUTTON_PRIMARY} mt-5 disabled:pointer-events-none disabled:opacity-40`}
          >
            구글로 로그인
          </button>

          {!configured ? (
            <p className="mt-3 text-xs leading-relaxed text-dim">
              이 환경에는 Supabase 설정이 없어 로그인을 쓸 수 없어요.
              <br />
              NEXT_PUBLIC_SUPABASE_URL 과 NEXT_PUBLIC_SUPABASE_ANON_KEY 가 필요해요.
            </p>
          ) : null}
        </>
      )}
    </div>
  )
}
