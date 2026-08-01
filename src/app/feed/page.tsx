import { notFound } from 'next/navigation'
import BackButton from '@/components/BackButton'
import ShortsFeed from '@/components/ShortsFeed'
import { getVideos } from '@/lib/videoSearch'

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; i?: string }>
}) {
  const { q = '', i } = await searchParams
  if (!q.trim()) notFound()

  const result = await getVideos(q)
  if (result.videos.length === 0) notFound()

  const requested = Number(i ?? 0)
  const initialIndex = Number.isFinite(requested)
    ? Math.min(Math.max(Math.trunc(requested), 0), result.videos.length - 1)
    : 0

  return (
    <>
      <BackButton />
      <ShortsFeed videos={result.videos} initialIndex={initialIndex} />
    </>
  )
}
