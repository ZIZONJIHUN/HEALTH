import Image from 'next/image'
import Link from 'next/link'
import { formatDuration } from '@/lib/duration'
import { Play } from '@/components/icons'
import type { ShortVideo } from '@/lib/types'

/**
 * lg 이상에서는 왼쪽에 인체도 레일(320~360px)이 붙으므로 그리드가 쓸 수 있는 폭이
 * 그만큼 줄어든다. sizes 도 그 폭 기준으로 잡아야 과한 해상도를 안 받는다.
 */
const THUMBNAIL_SIZES =
  '(min-width: 1536px) 17vw, (min-width: 1280px) 20vw, (min-width: 1024px) 26vw, (min-width: 640px) 31vw, 46vw'

const GRID_CLASSES =
  'grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5'

export default function VideoGrid({ query, videos }: { query: string; videos: ShortVideo[] }) {
  return (
    <ul className={GRID_CLASSES}>
      {videos.map((video, index) => (
        <li key={video.id}>
          <Link
            href={`/feed?q=${encodeURIComponent(query)}&i=${index}`}
            data-testid="video-card"
            className="group block rounded-xl"
          >
            <div className="relative aspect-[9/16] overflow-hidden rounded-xl bg-surface2 ring-1 ring-border/70 ring-inset">
              <Image
                src={video.thumbnailUrl}
                alt=""
                fill
                sizes={THUMBNAIL_SIZES}
                className="object-cover transition-transform duration-300 ease-out-quint group-hover:scale-[1.04]"
              />

              <div
                aria-hidden
                className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100"
              />
              <div
                aria-hidden
                className="absolute top-1/2 left-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 scale-90 items-center justify-center rounded-full bg-accent text-accent-fg opacity-0 shadow-pop transition-all duration-200 ease-out-quint group-hover:scale-100 group-hover:opacity-100"
              >
                {/* 삼각형은 광학적으로 왼쪽에 치우쳐 보여서 1px 밀어준다 */}
                <Play size={18} weight="fill" className="translate-x-px" />
              </div>

              <span className="tabular absolute right-1.5 bottom-1.5 rounded-md bg-black/75 px-1.5 py-0.5 text-[11px] font-medium text-text backdrop-blur-sm">
                {formatDuration(video.durationSeconds)}
              </span>
            </div>

            <p className="mt-2 line-clamp-2 text-[13px] leading-snug font-medium text-text transition-colors group-hover:text-accent sm:text-sm">
              {video.title}
            </p>
            <p className="mt-1 text-xs text-dim">{video.channelTitle}</p>
          </Link>
        </li>
      ))}
    </ul>
  )
}

/**
 * 검색은 YouTube API 왕복이라 몇 초가 걸린다. 원형 스피너 대신 최종 레이아웃과 같은
 * 모양을 미리 그려서 결과가 어디에 어떻게 들어올지 보여준다.
 */
export function VideoGridSkeleton({ count = 10 }: { count?: number }) {
  return (
    <div role="status" aria-label="검색 결과를 불러오는 중">
      <ul className={GRID_CLASSES} aria-hidden>
        {Array.from({ length: count }, (_, index) => (
          <li key={index}>
            <div className="skeleton aspect-[9/16] rounded-xl" />
            <div className="skeleton mt-2 h-3.5 rounded" />
            <div className="skeleton mt-1.5 h-3.5 w-2/3 rounded" />
            <div className="skeleton mt-2 h-3 w-1/2 rounded" />
          </li>
        ))}
      </ul>
    </div>
  )
}
