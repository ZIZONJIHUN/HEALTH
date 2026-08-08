import { Suspense } from 'react'
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

  return (
    <div className="space-y-6">
      <SearchHeader query={q} />

      {/*
        느린 건 getVideos 뿐이다. 검색창과 칩은 즉시 보내고 결과만 스트리밍해서,
        검색을 기다리는 동안에도 다른 검색어를 칠 수 있게 한다.
        (loading.tsx 를 쓰면 검색창까지 스켈레톤으로 사라진다.)
        key 를 붙여야 검색어가 바뀔 때마다 폴백이 다시 뜬다.
      */}
      {q.trim() ? (
        <Suspense key={q} fallback={<VideoGridSkeleton />}>
          <SearchResults query={q} />
        </Suspense>
      ) : (
        <SuggestPanel />
      )}
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
