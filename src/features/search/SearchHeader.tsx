import CategoryChips from '@/features/search/CategoryChips'
import SearchBar from '@/features/search/SearchBar'

/**
 * 페이지와 에러 화면이 같은 머리말을 쓴다. error.tsx 는 page.tsx 의 서브트리를 통째로
 * 대체하므로, 여기를 공유하지 않으면 두 화면의 검색창이 조금씩 달라진다.
 *
 * 데스크톱에서는 제목만 스크롤로 흘려보내고 검색창과 칩은 상단에 붙여 둔다.
 * 결과를 한참 내려보다가 다른 부위로 넘어갈 때 위로 되돌아갈 필요가 없다.
 */
export default function SearchHeader({ query = '' }: { query?: string }) {
  return (
    <header>
      <h1 className="text-[26px] font-extrabold tracking-tight sm:text-3xl md:text-[32px]">
        어떤 운동을 볼까요
      </h1>

      <div className="mt-4 space-y-4 lg:sticky lg:top-16 lg:z-30 lg:-mx-3 lg:bg-bg/85 lg:px-3 lg:py-4 lg:backdrop-blur-xl">
        <div className="md:max-w-xl">
          <SearchBar defaultValue={query} />
        </div>
        <CategoryChips activeQuery={query} />
      </div>
    </header>
  )
}
