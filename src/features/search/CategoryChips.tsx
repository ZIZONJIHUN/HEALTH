import Link from 'next/link'
import { chipClass } from '@/components/ui/Chip'
import { BODY_PARTS, matchQuery, subgroupsOf } from '@/features/body/categories'

/**
 * 부위 칩. 상위 7개를 먼저 보여주고, 하나를 고르면 그 아래에 세부 근육 줄이 열린다.
 *
 * 펼침 상태를 컴포넌트 상태로 들지 않고 **URL 의 q 에서 유도한다.** 상태로 들면
 * 뒤로가기·새로고침·링크 공유에서 펼침이 풀려서, 세부 부위 결과를 보고 있는데
 * 어디에 있는지 알 수 없게 된다.
 */
export default function CategoryChips({ activeQuery = '' }: { activeQuery?: string }) {
  const match = matchQuery(activeQuery)
  const openPart = match.kind === 'none' ? null : match.part
  const subgroups = openPart ? subgroupsOf(openPart.id) : []

  return (
    <div className="space-y-2">
      <ChipRow>
        {BODY_PARTS.map((part) => (
          <Chip
            key={part.id}
            href={part.query}
            label={part.label}
            // 세부를 보고 있어도 상위 칩은 켜둔다. 지금 어느 부위에 있는지 알려준다.
            active={openPart?.id === part.id}
          />
        ))}
      </ChipRow>

      {openPart && subgroups.length > 0 ? (
        <ChipRow className="enter-y">
          {/* 세부에서 상위로 돌아갈 길. 없으면 상위 칩을 다시 눌러야 하는데
              이미 켜져 있어서 되돌아갈 수 있다는 게 안 보인다. */}
          <Chip
            href={openPart.query}
            label={`${openPart.label} 전체`}
            active={match.kind === 'part'}
            small
          />
          {subgroups.map((group) => (
            <Chip
              key={group.id}
              href={group.query}
              label={group.label}
              active={match.kind === 'group' && match.group.id === group.id}
              small
            />
          ))}
        </ChipRow>
      ) : null}
    </div>
  )
}

function ChipRow({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative -mx-4 sm:-mx-6 md:mx-0 ${className}`}>
      <ul className="scrollbar-none flex gap-2 overflow-x-auto px-4 py-1 sm:px-6 md:flex-wrap md:px-0">
        {children}
      </ul>

      {/* 모바일에서는 칩이 화면 밖으로 넘친다. 오른쪽이 잘렸다는 신호를 준다.
          칩이 전부 들어가는 md 이상에서는 필요 없다. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-bg to-transparent md:hidden"
      />
    </div>
  )
}

function Chip({
  href,
  label,
  active,
  small = false,
}: {
  href: string
  label: string
  active: boolean
  small?: boolean
}) {
  return (
    <li className="shrink-0">
      <Link
        href={`/?q=${encodeURIComponent(href)}`}
        aria-current={active ? 'true' : undefined}
        className={chipClass(active, small ? 'sm' : 'md')}
      >
        {label}
      </Link>
    </li>
  )
}
