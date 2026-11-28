import { notFound } from 'next/navigation'
import BackButton from '@/features/feed/BackButton'
import HomeButton from '@/features/feed/HomeButton'
import { searchHomeHref } from '@/features/feed/homeTarget'
import RecentFeed from '@/features/history/RecentFeed'
import RoutineFeed from '@/features/routines/RoutineFeed'
import ShortsFeed from '@/features/feed/ShortsFeed'
import { filterByLength, toLengthFilter } from '@/features/search/lengthFilter'
import { firstParam } from '@/features/search/searchParams'
import { getVideos } from '@/lib/videoSearch'

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string | string[]
    i?: string | string[]
    len?: string | string[]
    pages?: string | string[]
    routine?: string | string[]
    recent?: string | string[]
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
        <HomeButton href="/routines" label="루틴 목록으로" />
        <RoutineFeed routineId={routineId} requestedIndex={requestedIndex} />
      </main>
    )
  }

  // 최근 본 영상도 localStorage 에만 있다.
  if (firstParam(params.recent)) {
    return (
      <main id="main">
        <BackButton />
        <HomeButton href="/" label="홈으로" />
        <RecentFeed requestedIndex={requestedIndex} />
      </main>
    )
  }

  const q = firstParam(params.q) ?? ''
  if (!q.trim()) notFound()

  // pages 도 그리드와 맞춰야 한다. 그리드가 2페이지를 보여주는데 여기서 1페이지만
  // 받으면 60번째 카드를 눌렀을 때 전혀 다른 영상이 뜬다.
  // 이미 캐시에 있는 분량이라 쿼터를 다시 쓰지 않는다.
  const result = await getVideos(q, Number(firstParam(params.pages) ?? 1))
  // 그리드가 길이 필터를 걸고 있었다면 여기도 같은 필터를 걸어야
  // i 가 가리키는 영상이 그리드에서 누른 영상과 같아진다.
  const videos = filterByLength(result.videos, toLengthFilter(firstParam(params.len)).maxSeconds)
  if (videos.length === 0) notFound()

  const initialIndex = Math.min(Math.max(requestedIndex, 0), videos.length - 1)

  return (
    <main id="main">
      <BackButton />
      <HomeButton
        href={searchHomeHref({
          q,
          len: firstParam(params.len),
          pages: firstParam(params.pages),
        })}
        label="검색 결과로"
      />
      <ShortsFeed videos={videos} initialIndex={initialIndex} />
    </main>
  )
}
