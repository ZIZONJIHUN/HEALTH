'use client'

import { useRef } from 'react'
import Image from 'next/image'
import { FEED_PLAYER_BOX } from '@/components/feedPlayerBox'
import { buildEmbedUrl } from '@/lib/embed'
import { useVideoEnded } from '@/lib/useVideoEnded'
import type { ShortVideo } from '@/lib/types'

/**
 * active 가 false 면 iframe을 만들지 않는다.
 * 슬라이드 수만큼 iframe을 동시에 띄우면 모바일에서 즉시 버벅인다.
 *
 * autoplay는 active와 별개다. 마운트 윈도우(±1) 안의 이전/다음 슬라이드도
 * active로 마운트되어 플레이어 셸을 미리 준비하지만, 화면에 보이지 않는
 * 동안 스트리밍하면 모바일 데이터와 디코딩 비용만 세 배로 든다.
 *
 * onEnded 가 있으면 루틴 재생이다. 이때만 반복을 끄고 끝을 감지한다 —
 * loop=1 이면 영상이 영원히 끝나지 않아 "다음 운동"을 띄울 시점이 없다.
 */
export default function FeedSlide({
  video,
  active,
  autoplay,
  onEnded,
}: {
  video: ShortVideo
  active: boolean
  autoplay: boolean
  onEnded?: () => void
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const routineMode = onEnded != null

  useVideoEnded(iframeRef, active && autoplay, onEnded)

  return (
    <div className="relative flex h-full w-full items-center justify-center bg-black">
      {/* 데스크톱에서는 9:16 플레이어 양옆이 비는데, 검은 여백만 두면 화면이 죽는다.
          같은 썸네일을 크게 흐려 깔아 영상 색이 화면 전체로 번지게 한다. */}
      <Image
        src={video.thumbnailUrl}
        alt=""
        aria-hidden
        fill
        sizes="100vw"
        className="hidden scale-110 object-cover opacity-20 blur-3xl md:block"
      />

      <div
        className={`relative h-full w-full overflow-hidden md:rounded-2xl md:shadow-pop md:ring-1 md:ring-white/10 ${FEED_PLAYER_BOX}`}
      >
        {active ? (
          <iframe
            ref={iframeRef}
            src={buildEmbedUrl(video.id, {
              autoplay,
              loop: !routineMode,
              enableJsApi: routineMode,
            })}
            title={video.title}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            className="absolute inset-0 h-full w-full border-0"
          />
        ) : (
          <Image
            src={video.thumbnailUrl}
            alt=""
            fill
            sizes="(min-width: 768px) 500px, 100vw"
            className="object-cover opacity-50"
          />
        )}

        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/45 to-transparent px-4 pt-12 pb-6"
          style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
        >
          <p className="line-clamp-2 text-sm leading-snug font-semibold text-text">{video.title}</p>
          <p className="mt-1 text-xs text-muted">{video.channelTitle}</p>
        </div>
      </div>
    </div>
  )
}
