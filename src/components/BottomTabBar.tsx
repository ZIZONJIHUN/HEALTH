'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { TABS } from '@/data/navigation'
import { ICON_WEIGHT } from '@/components/icons'

/** 데스크톱에서는 TopNav 가 대신한다 (md 이상에서 숨긴다). */
export default function BottomTabBar() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="주요 메뉴"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg/85 backdrop-blur-xl md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="mx-auto flex max-w-md">
        {TABS.map((tab) => {
          const active = pathname === tab.href
          const Icon = tab.icon
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={`flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold tracking-tight ${
                  active ? 'text-accent' : 'text-dim hover:text-muted'
                }`}
              >
                <Icon size={22} weight={active ? 'fill' : ICON_WEIGHT} aria-hidden />
                {tab.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
