import Link from 'next/link'
import { chipClass } from '@/components/ui/Chip'
import { POPULAR_EXERCISES } from '@/features/body/categories'
import { Lightning } from '@/components/ui/icons'

/**
 * 검색 전 첫 화면. 예전에는 "운동 이름을 검색하거나 위 부위를 선택하세요" 한 줄이 전부라
 * 첫 화면이 사실상 비어 있었다. 바로 누를 수 있는 것을 보여주는 편이 낫다.
 *
 * 20개를 목록으로 세우면 스크롤만 길어지므로 눌러보고 싶어지는 알약 묶음으로 흩뿌린다.
 */
export default function SuggestPanel() {
  return (
    <section aria-labelledby="popular-heading" className="pt-2">
      <div className="flex items-center gap-2">
        <Lightning size={16} weight="fill" aria-hidden className="text-accent" />
        <h2 id="popular-heading" className="text-sm font-semibold tracking-tight text-text">
          많이 찾는 운동
        </h2>
      </div>

      <ul className="mt-4 flex flex-wrap gap-2">
        {POPULAR_EXERCISES.map((name) => (
          <li key={name}>
            <Link href={`/?q=${encodeURIComponent(name)}`} className={chipClass(false, 'md')}>
              {name}
            </Link>
          </li>
        ))}
      </ul>

      {/* 같은 아이콘을 한 화면에 두 번 쓰면 장식으로만 보인다. 여기는 글만 둔다. */}
      <p className="mt-6 text-xs text-dim">위 부위 칩을 눌러 부위별로 찾을 수도 있어요.</p>
    </section>
  )
}
