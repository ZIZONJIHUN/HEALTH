import Image from 'next/image'
import { buildEmbedUrl } from '@/lib/embed'
import type { ShortVideo } from '@/lib/types'

/**
 * active 가 false 면 iframe을 만들지 않는다.
 * 슬라이드 수만큼 iframe을 동시에 띄우면 모바일에서 즉시 버벅인다.
 *
 * autoplay는 active와 별개다. 마운트 윈도우(±1) 안의 이전/다음 슬라이드도
 * active로 마운트되어 플레이어 셸을 미리 준비하지만, 화면에 보이지 않는
 * 동안 스트리밍하면 모바일 데이터와 디코딩 비용만 세 배로 든다.
 */
export default function FeedSlide({
  video,
  active,
  autoplay,
}: {
  video: ShortVideo
  active: boolean
  autoplay: boolean
}) {
  return (
    <div className="relative h-full w-full bg-black">
      {active ? (
        <iframe
          src={buildEmbedUrl(video.id, { autoplay })}
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
