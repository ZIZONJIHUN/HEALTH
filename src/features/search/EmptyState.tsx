import Link from 'next/link'
import { cardClass } from '@/components/ui/Card'
import { chipClass } from '@/components/ui/Chip'
import { POPULAR_EXERCISES } from '@/features/body/categories'
import { ICON_WEIGHT, SmileyMeh } from '@/components/ui/icons'

export default function EmptyState({ query }: { query: string }) {
  return (
    <div data-testid="empty-state" className={cardClass('solid', 'p-6 sm:p-8')}>
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-surface2 text-muted">
        <SmileyMeh size={22} weight={ICON_WEIGHT} aria-hidden />
      </div>

      <p className="mt-4 text-[15px] text-text">
        <span className="font-semibold">{query}</span> 에 맞는 쇼츠를 찾지 못했어요.
      </p>
      <p className="mt-1 text-sm text-muted">철자를 확인하거나 아래 운동을 눌러보세요.</p>

      <ul className="mt-5 flex flex-wrap gap-2">
        {POPULAR_EXERCISES.slice(0, 6).map((name) => (
          <li key={name}>
            <Link href={`/?q=${encodeURIComponent(name)}`} className={chipClass(false, 'sm')}>
              {name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
