import CategoryChips from '@/components/CategoryChips'
import EmptyState from '@/components/EmptyState'
import QuotaBanner from '@/components/QuotaBanner'
import SearchBar from '@/components/SearchBar'
import VideoGrid from '@/components/VideoGrid'
import { getVideos } from '@/lib/videoSearch'

export default async function ExercisePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q = '' } = await searchParams
  const result = q.trim() ? await getVideos(q) : null

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">어떤 운동을 볼까요</h1>
      <SearchBar defaultValue={q} />
      <CategoryChips />

      {result?.quotaExceeded ? <QuotaBanner /> : null}

      {result === null ? (
        <p className="pt-6 text-center text-sm text-muted">
          운동 이름을 검색하거나 위 부위를 선택하세요.
        </p>
      ) : result.videos.length === 0 ? (
        <EmptyState query={result.query} />
      ) : (
        <VideoGrid query={result.query} videos={result.videos} />
      )}
    </div>
  )
}
