import CategoryChips from '@/components/CategoryChips'
import SearchBar from '@/components/SearchBar'

/**
 * 페이지와 에러 화면이 같은 머리말을 쓴다. error.tsx 는 page.tsx 의 서브트리를 통째로
 * 대체하므로, 여기를 공유하지 않으면 두 화면의 검색창이 조금씩 달라진다.
 */
export default function SearchHeader({ query = '' }: { query?: string }) {
  return (
    <header className="space-y-4">
      <h1 className="text-[26px] font-extrabold tracking-tight sm:text-3xl md:text-[32px]">
        어떤 운동을 볼까요
      </h1>
      <div className="md:max-w-xl">
        <SearchBar defaultValue={query} />
      </div>
      <CategoryChips activeQuery={query} />
    </header>
  )
}
