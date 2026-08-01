import Image from 'next/image'
import { buildEmbedUrl } from '@/lib/embed'
import type { ShortVideo } from '@/lib/types'

/**
 * active 가 false 면 iframe을 만들지 않는다.
 * 슬라이드 수만큼 iframe을 동시에 띄우면 모바일에서 즉시 버벅인다.
 */
export default function FeedSlide({ video, active }: { video: ShortVideo; active: boolean }) {
  return (
    <div className="relative h-full w-full bg-black">
      {active ? (
        <iframe
          src={buildEmbedUrl(video.id)}
          title={video.title}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 h-full w-full border-0"
        />
      ) : (
        <Image src={video.thumbnailUrl} alt="" fill sizes="100vw" className="object-cover opacity-50" />
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-4 pb-8">
        <p className="line-clamp-2 text-sm font-medium text-text">{video.title}</p>
        <p className="mt-0.5 text-xs text-muted">{video.channelTitle}</p>
      </div>
    </div>
  )
}
