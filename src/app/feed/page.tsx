import { notFound } from 'next/navigation'
import BackButton from '@/components/BackButton'
import RoutineFeed from '@/components/RoutineFeed'
import ShortsFeed from '@/components/ShortsFeed'
import { filterByLength, toLengthFilter } from '@/lib/lengthFilter'
import { firstParam } from '@/lib/searchParams'
import { getVideos } from '@/lib/videoSearch'

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string | string[]
    i?: string | string[]
    len?: string | string[]
    routine?: string | string[]
  }>
}) {
  const params = await searchParams
  const i = firstParam(params.i)
  const requested = Number(i ?? 0)
  const requestedIndex = Number.isFinite(requested) ? Math.trunc(requested) : 0

  // 루틴 재생은 목록이 localStorage 에 있어 서버가 알 수 없다. 클라이언트에 넘긴다.
  const routineId = firstParam(params.routine)
  if (routineId) {
    return (
      <main id="main">
        <BackButton />
        <RoutineFeed routineId={routineId} requestedIndex={requestedIndex} />
      </main>
    )
  }

  const q = firstParam(params.q) ?? ''
  if (!q.trim()) notFound()

  const result = await getVideos(q)
  // 그리드가 길이 필터를 걸고 있었다면 여기도 같은 필터를 걸어야
  // i 가 가리키는 영상이 그리드에서 누른 영상과 같아진다.
  const videos = filterByLength(result.videos, toLengthFilter(firstParam(params.len)).maxSeconds)
  if (videos.length === 0) notFound()

  const initialIndex = Math.min(Math.max(requestedIndex, 0), videos.length - 1)

  return (
    <main id="main">
      <BackButton />
      <ShortsFeed videos={videos} initialIndex={initialIndex} />
    </main>
  )
}
