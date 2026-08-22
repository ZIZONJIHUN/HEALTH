import Link from 'next/link'
import { LENGTH_FILTERS, type LengthFilterId } from '@/lib/lengthFilter'

/**
 * 결과 개수와 길이 필터.
 *
 * 필터는 이미 받아온 결과를 걸러낼 뿐이라 새 검색이 아니다. 링크로 만들어 두면
 * 뒤로가기로 되돌릴 수 있고 URL 로 공유도 된다. 쿼터는 늘지 않는다.
 */
export default function ResultToolbar({
  query,
  shown,
  total,
  activeFilter,
}: {
  query: string
  shown: number
  total: number
  activeFilter: LengthFilterId
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
      <p className="text-sm text-muted">
        <span className="tabular font-semibold text-text">{shown}</span>개
        {shown < total ? <span className="text-dim"> · 전체 {total}개 중</span> : null}
      </p>

      <ul className="flex gap-1.5">
        {LENGTH_FILTERS.map((filter) => {
          const active = filter.id === activeFilter
          const params = new URLSearchParams({ q: query })
          if (filter.id !== 'all') params.set('len', filter.id)
          return (
            <li key={filter.id}>
              <Link
                href={`/?${params.toString()}`}
                aria-current={active ? 'true' : undefined}
                scroll={false}
                className={`inline-flex h-8 items-center rounded-lg px-3 text-xs font-medium ${
                  active
                    ? 'bg-surface3 text-accent'
                    : 'text-dim hover:bg-surface2 hover:text-text'
                }`}
              >
                {filter.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
