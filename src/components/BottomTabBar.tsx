'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [{ href: '/', label: '운동' }] as const

export default function BottomTabBar() {
  const pathname = usePathname()

  return (
    <nav aria-label="주요 메뉴" className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface">
      <ul className="mx-auto flex max-w-md">
        {TABS.map((tab) => {
          const active = pathname === tab.href
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={`flex h-16 items-center justify-center text-xs font-medium ${
                  active ? 'text-accent' : 'text-muted'
                }`}
              >
                {tab.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
