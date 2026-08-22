'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { TABS } from '@/data/navigation'
import { Barbell, ICON_WEIGHT } from '@/components/icons'

/**
 * 데스크톱 전용 헤더. 모바일에서는 화면 높이가 아까워 하단 탭바(BottomTabBar)만 쓴다.
 * 높이는 64px 로 고정한다 — 뷰포트를 잡아먹는 큰 헤더는 콘텐츠 앱에 어울리지 않는다.
 */
export default function TopNav() {
  const pathname = usePathname()

  return (
    <header className="sticky top-0 z-40 hidden border-b border-border bg-bg/80 backdrop-blur-xl md:block">
      <div className="mx-auto flex h-16 w-full max-w-4xl items-center gap-8 px-6 lg:max-w-6xl xl:max-w-[1500px]">
        <Link href="/" className="flex items-center gap-2 text-text hover:text-accent">
          <Barbell size={22} weight="fill" className="text-accent" aria-hidden />
          <span className="text-[15px] font-extrabold tracking-tight">헬스 쇼츠</span>
        </Link>

        <nav aria-label="주요 메뉴">
          <ul className="flex items-center gap-1">
            {TABS.map((tab) => {
              const active = pathname === tab.href
              const Icon = tab.icon
              return (
                <li key={tab.href}>
                  <Link
                    href={tab.href}
                    aria-current={active ? 'page' : undefined}
                    className={`flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold ${
                      active
                        ? 'bg-surface2 text-accent'
                        : 'text-muted hover:bg-surface2 hover:text-text'
                    }`}
                  >
                    <Icon size={16} weight={ICON_WEIGHT} aria-hidden />
                    {tab.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
      </div>
    </header>
  )
}
