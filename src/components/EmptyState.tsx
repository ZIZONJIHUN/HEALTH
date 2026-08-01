import Link from 'next/link'
import { POPULAR_EXERCISES } from '@/data/categories'

export default function EmptyState({ query }: { query: string }) {
  return (
    <div data-testid="empty-state" className="rounded-xl border border-border bg-surface p-5">
      <p className="text-sm text-text">
        <span className="font-semibold">{query}</span> 에 맞는 쇼츠를 찾지 못했어요.
      </p>
      <p className="mt-1 text-xs text-muted">철자를 확인하거나 아래 운동을 눌러보세요.</p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {POPULAR_EXERCISES.slice(0, 6).map((name) => (
          <li key={name}>
            <Link
              href={`/?q=${encodeURIComponent(name)}`}
              className="inline-flex h-8 items-center rounded-full border border-border bg-surface2 px-3 text-xs text-text"
            >
              {name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
