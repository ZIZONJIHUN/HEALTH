import { notFound } from 'next/navigation'
import BackButton from '@/components/BackButton'
import ShortsFeed from '@/components/ShortsFeed'
import { firstParam } from '@/lib/searchParams'
import { getVideos } from '@/lib/videoSearch'

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; i?: string | string[] }>
}) {
  const params = await searchParams
  const q = firstParam(params.q) ?? ''
  const i = firstParam(params.i)
  if (!q.trim()) notFound()

  const result = await getVideos(q)
  if (result.videos.length === 0) notFound()

  const requested = Number(i ?? 0)
  const initialIndex = Number.isFinite(requested)
    ? Math.min(Math.max(Math.trunc(requested), 0), result.videos.length - 1)
    : 0

  return (
    <main id="main">
      <BackButton />
      <ShortsFeed videos={result.videos} initialIndex={initialIndex} />
    </main>
  )
}
