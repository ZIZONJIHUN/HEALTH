import Image from 'next/image'
import Link from 'next/link'
import AddToRoutineButton from '@/features/routines/AddToRoutineButton'
import { formatDuration } from '@/lib/duration'
import { Play } from '@/components/ui/icons'
import type { LengthFilterId } from '@/features/search/lengthFilter'
import type { ShortVideo } from '@/lib/types'

/**
 * lg 이상에서는 왼쪽에 인체도 레일(320~360px)이 붙으므로 그리드가 쓸 수 있는 폭이
 * 그만큼 줄어든다. sizes 도 그 폭 기준으로 잡아야 과한 해상도를 안 받는다.
 */
const THUMBNAIL_SIZES =
  '(min-width: 1536px) 17vw, (min-width: 1280px) 20vw, (min-width: 1024px) 26vw, (min-width: 640px) 31vw, 46vw'

const GRID_CLASSES =
  'grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5'

/** 스태거가 길어지면 마지막 카드가 늦게 떠서 느려 보인다. 앞쪽 몇 장만 어긋나게 한다. */
const STAGGER_STEP_MS = 35
const STAGGER_MAX_INDEX = 12

export default function VideoGrid({
  query,
  videos,
  lengthFilter,
}: {
  query: string
  videos: ShortVideo[]
  lengthFilter: LengthFilterId
}) {
  return (
    <ul className={GRID_CLASSES}>
      {videos.map((video, index) => {
        // 필터가 걸리면 순서가 달라진다. 피드도 같은 필터를 알아야 i 가 가리키는
        // 영상이 그리드에서 누른 영상과 같아진다.
        const params = new URLSearchParams({ q: query })
        if (lengthFilter !== 'all') params.set('len', lengthFilter)
        params.set('i', String(index))

        return (
          <li
            key={video.id}
            className="enter-y relative"
            style={{ animationDelay: `${Math.min(index, STAGGER_MAX_INDEX) * STAGGER_STEP_MS}ms` }}
          >
            <Link
              href={`/feed?${params.toString()}`}
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

            {/* 카드 링크 바깥에 둔다. 안에 넣으면 담기 버튼을 눌러도 피드로 넘어간다. */}
            <AddToRoutineButton video={video} />
          </li>
        )
      })}
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
