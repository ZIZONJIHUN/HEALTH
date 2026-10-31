import { Suspense } from 'react'
import Link from 'next/link'
import { BUTTON_SECONDARY } from '@/components/ui/Button'
import BodyPanel from '@/features/body/BodyPanel'
import RecentPanel from '@/features/history/RecentPanel'
import RecordSearch from '@/features/history/RecordSearch'
import EmptyState from '@/features/search/EmptyState'
import QuotaBanner from '@/features/search/QuotaBanner'
import ResultToolbar from '@/features/search/ResultToolbar'
import SearchHeader from '@/features/search/SearchHeader'
import SuggestPanel from '@/features/search/SuggestPanel'
import VideoGrid, { VideoGridSkeleton } from '@/features/search/VideoGrid'
import {
  filterByLength,
  toLengthFilter,
  type LengthFilterId,
} from '@/features/search/lengthFilter'
import { firstParam } from '@/features/search/searchParams'
import { getVideos } from '@/lib/videoSearch'

export default async function ExercisePage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string | string[]
    len?: string | string[]
    pages?: string | string[]
  }>
}) {
  const params = await searchParams
  const q = firstParam(params.q) ?? ''
  const len = firstParam(params.len)
  // 상한(MAX_PAGES)은 getVideos 가 건다. 여기서 막으면 /feed 쪽에 또 적어야 한다.
  const pages = Number(firstParam(params.pages) ?? 1)
  const searching = q.trim().length > 0

  return (
    /*
      DOM 순서는 모바일 기준(머리말 → 인체도 → 결과)으로 두고, 데스크톱에서는
      그리드 배치로 인체도만 왼쪽 레일로 보낸다. order 로 뒤집으면 탭 순서가
      화면 순서와 어긋난다.

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
            key 에 길이 필터까지 넣어야 필터를 바꿀 때도 폴백이 다시 뜬다.

            pages 는 key 에 넣지 않는다. 넣으면 "더 보기"를 누를 때 이미 보고 있던
            결과가 통째로 스켈레톤으로 바뀌었다가 돌아온다 — 아래에 덧붙는 동작과
            맞지 않는다.
          */
          <Suspense key={`${q}:${len ?? 'all'}`} fallback={<VideoGridSkeleton />}>
            <SearchResults query={q} lengthParam={len} pages={pages} />
          </Suspense>
        ) : (
          <>
            <RecentPanel />
            <SuggestPanel />
          </>
        )}
      </div>
    </div>
  )
}

async function SearchResults({
  query,
  lengthParam,
  pages,
}: {
  query: string
  lengthParam: string | undefined
  pages: number
}) {
  const result = await getVideos(query, pages)
  const filter = toLengthFilter(lengthParam)
  const videos = filterByLength(result.videos, filter.maxSeconds)

  return (
    <div className="space-y-4">
      {result.quotaExceeded ? <QuotaBanner /> : null}

      {result.videos.length === 0 ? (
        <EmptyState query={result.query} />
      ) : (
        <>
          {/* 결과가 없던 검색어는 남기지 않는다. 다시 눌러도 같은 빈 화면이다. */}
          <RecordSearch query={result.query} />
          <ResultToolbar
            query={result.query}
            shown={videos.length}
            total={result.videos.length}
            activeFilter={filter.id}
          />
          {videos.length === 0 ? (
            <p className="rounded-xl border border-border bg-surface px-4 py-6 text-center text-sm text-muted">
              이 길이에 맞는 영상이 없어요. 필터를 넓혀보세요.
            </p>
          ) : (
            <>
              <VideoGrid
                query={result.query}
                videos={videos}
                lengthFilter={filter.id}
                pages={result.pages}
              />
              {result.hasMore ? (
                <MoreLink query={result.query} lengthFilter={filter.id} nextPages={result.pages + 1} />
              ) : null}
            </>
          )}
        </>
      )}
    </div>
  )
}

/**
 * "더 보기". 버튼이 아니라 링크인 이유는 이 앱이 검색 상태를 전부 URL 에 두기 때문이다 —
 * 뒤로가기로 되돌릴 수 있고, 링크를 공유하면 같은 분량이 열린다.
 *
 * 페이지를 하나 더 받는 데 101 units 가 든다(검색 한 번과 같은 값이다). 그래서
 * 자동 무한 스크롤로 만들지 않았다. 스크롤만으로 쿼터가 녹으면 하루치가 금방 사라진다.
 */
function MoreLink({
  query,
  lengthFilter,
  nextPages,
}: {
  query: string
  lengthFilter: LengthFilterId
  nextPages: number
}) {
  const params = new URLSearchParams({ q: query })
  if (lengthFilter !== 'all') params.set('len', lengthFilter)
  params.set('pages', String(nextPages))

  return (
    <div className="flex justify-center pt-2">
      <Link href={`/?${params.toString()}`} scroll={false} className={BUTTON_SECONDARY}>
        더 보기
      </Link>
    </div>
  )
}
