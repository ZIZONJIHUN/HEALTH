import Link from 'next/link'
import { BODY_PARTS } from '@/data/categories'

/**
 * activeQuery 는 현재 URL 의 q 다. 지금 보고 있는 부위를 칩에 표시해 주지 않으면
 * 사용자가 어디에 있는지 알 수 없다.
 */
export default function CategoryChips({ activeQuery = '' }: { activeQuery?: string }) {
  return (
    <div className="relative -mx-4 sm:-mx-6 md:mx-0">
      <ul className="scrollbar-none flex gap-2 overflow-x-auto px-4 py-1 sm:px-6 md:flex-wrap md:px-0">
        {BODY_PARTS.map((part) => {
          const active = part.query === activeQuery
          return (
            <li key={part.id} className="shrink-0">
              <Link
                href={`/?q=${encodeURIComponent(part.query)}`}
                aria-current={active ? 'true' : undefined}
                className={`inline-flex h-9 items-center rounded-full border px-4 text-sm font-medium ${
                  active
                    ? 'border-transparent bg-accent text-accent-fg'
                    : 'border-border bg-surface2 text-muted hover:border-border-strong hover:bg-surface3 hover:text-text'
                }`}
              >
                {part.label}
              </Link>
            </li>
          )
        })}
      </ul>

      {/* 모바일에서는 칩이 항상 화면 밖으로 넘친다. 오른쪽이 잘렸다는 신호를 준다.
          칩이 전부 들어가는 md 이상에서는 필요 없다. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-bg to-transparent md:hidden"
      />
    </div>
  )
}
