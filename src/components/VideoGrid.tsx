import Image from 'next/image'
import Link from 'next/link'
import { formatDuration } from '@/lib/duration'
import type { ShortVideo } from '@/lib/types'

export default function VideoGrid({ query, videos }: { query: string; videos: ShortVideo[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3">
      {videos.map((video, index) => (
        <li key={video.id}>
          <Link
            href={`/feed?q=${encodeURIComponent(query)}&i=${index}`}
            data-testid="video-card"
            className="block"
          >
            <div className="relative aspect-[9/16] overflow-hidden rounded-xl bg-surface2">
              <Image src={video.thumbnailUrl} alt="" fill sizes="50vw" className="object-cover" />
              <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-[11px] text-text">
                {formatDuration(video.durationSeconds)}
              </span>
            </div>
            <p className="mt-1.5 line-clamp-2 text-sm text-text">{video.title}</p>
            <p className="mt-0.5 text-xs text-muted">{video.channelTitle}</p>
          </Link>
        </li>
      ))}
    </ul>
  )
}
