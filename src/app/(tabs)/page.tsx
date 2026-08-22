import { Suspense } from 'react'
import BodyPanel from '@/components/BodyPanel'
import EmptyState from '@/components/EmptyState'
import QuotaBanner from '@/components/QuotaBanner'
import SearchHeader from '@/components/SearchHeader'
import SuggestPanel from '@/components/SuggestPanel'
import VideoGrid, { VideoGridSkeleton } from '@/components/VideoGrid'
import { firstParam } from '@/lib/searchParams'
import { getVideos } from '@/lib/videoSearch'

export default async function ExercisePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>
}) {
  const q = firstParam((await searchParams).q) ?? ''
  const searching = q.trim().length > 0

  return (
    /*
      DOM 순서는 모바일 기준(머리말 → 인체도 → 결과)으로 두고, 데스크톱에서는
      그리드 배치로 인체도만 왼쪽 레일로 보낸다. order 로 뒤집으면 탭 순서가
      화면 순서와 어긋난다.
    */
    /*
      grid-rows 를 auto/1fr 로 고정하지 않으면, 두 행에 걸친 왼쪽 레일의 높이가
      두 행에 나눠 배분되면서 머리말과 결과 사이에 빈 공간이 생긴다.
    */
    <div className="lg:grid lg:grid-cols-[320px_minmax(0,1fr)] lg:grid-rows-[auto_1fr] lg:gap-x-10 xl:grid-cols-[360px_minmax(0,1fr)]">
      <div className="lg:col-start-2 lg:row-start-1">
        <SearchHeader query={q} />
      </div>

      {/* 모바일에서는 결과가 주인공이다. 검색 중이면 인체도를 접는다. */}
      <aside
        className={`mt-8 lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:mt-0 ${
          searching ? 'hidden lg:block' : ''
        }`}
      >
        <BodyPanel activeQuery={q} />
      </aside>

      <div className="mt-8 lg:col-start-2 lg:row-start-2 lg:mt-6">
        {searching ? (
          /*
            느린 건 getVideos 뿐이다. 검색창과 칩은 즉시 보내고 결과만 스트리밍해서,
            검색을 기다리는 동안에도 다른 검색어를 칠 수 있게 한다.
            (loading.tsx 를 쓰면 검색창까지 스켈레톤으로 사라진다.)
            key 를 붙여야 검색어가 바뀔 때마다 폴백이 다시 뜬다.
          */
          <Suspense key={q} fallback={<VideoGridSkeleton />}>
            <SearchResults query={q} />
          </Suspense>
        ) : (
          <SuggestPanel />
        )}
      </div>
    </div>
  )
}

async function SearchResults({ query }: { query: string }) {
  const result = await getVideos(query)

  return (
    <div className="space-y-4">
      {result.quotaExceeded ? <QuotaBanner /> : null}

      {result.videos.length === 0 ? (
        <EmptyState query={result.query} />
      ) : (
        <VideoGrid query={result.query} videos={result.videos} />
      )}
    </div>
  )
}
