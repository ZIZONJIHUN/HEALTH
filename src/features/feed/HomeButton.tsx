'use client'

import type { MouseEvent } from 'react'
import Link from 'next/link'
import { iconButtonClass } from '@/components/ui/IconButton'
import { House, ICON_WEIGHT } from '@/components/ui/icons'
import { findReturnEntry, type HistoryEntry } from './homeTarget'

/** Navigation API 중 쓰는 부분만. TS 의 DOM 타입에 아직 없는 브라우저 API 다. */
type NavigationLike = {
  entries(): HistoryEntry[]
  currentEntry: { index: number } | null
  traverseTo(key: string): unknown
}

/**
 * 몇 개를 넘겼든 한 번에 떠나온 화면(검색 그리드·루틴 목록·홈)으로 돌아간다.
 *
 * 그 화면이 방문 기록에 있으면 거기로 되돌아간다(traverseTo) — 새로 열지 않으므로 그리드의
 * 스크롤 위치가 그대로이고, 거기서 뒤로가기를 눌러도 피드로 다시 들어오지 않는다.
 * 기록에 없거나(공유 링크로 바로 들어옴) Navigation API 가 없는 브라우저에서는 링크대로 그 주소로
 * 간다. replace 인 이유: 홈으로 간 뒤 뒤로가기가 방금 떠난 피드로 돌아가지 않게.
 *
 * 버튼이 아니라 링크인 이유: 느린 연결에서 스크립트가 붙기 전에 눌러도 움직여야 한다.
 */
export default function HomeButton({ href, label }: { href: string; label: string }) {
  function goHome(event: MouseEvent<HTMLAnchorElement>) {
    const navigation = (window as unknown as { navigation?: NavigationLike }).navigation
    const current = navigation?.currentEntry
    if (!navigation || !current) return
    const key = findReturnEntry(navigation.entries(), current.index, href)
    if (key === null) return
    event.preventDefault()
    navigation.traverseTo(key)
  }

  return (
    <Link
      href={href}
      replace
      onClick={goHome}
      data-testid="home-button"
      aria-label={label}
      className={iconButtonClass('overlay', 'md', 'fixed left-[3.75rem] z-50')}
      style={{ top: 'max(0.75rem, env(safe-area-inset-top))' }}
    >
      <House size={18} weight={ICON_WEIGHT} aria-hidden />
    </Link>
  )
}
