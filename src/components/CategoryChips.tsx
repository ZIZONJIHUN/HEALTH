import Link from 'next/link'
import { BODY_PARTS } from '@/data/categories'

export default function CategoryChips() {
  return (
    <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
      {BODY_PARTS.map((part) => (
        <li key={part.id} className="shrink-0">
          <Link
            href={`/?q=${encodeURIComponent(part.query)}`}
            className="inline-flex h-9 items-center rounded-full border border-border bg-surface2 px-4 text-sm text-text"
          >
            {part.label}
          </Link>
        </li>
      ))}
    </ul>
  )
}
