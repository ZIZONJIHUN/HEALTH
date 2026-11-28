'use client'

import Image from 'next/image'
import Link from 'next/link'
import { chipClass } from '@/components/ui/Chip'
import { iconButtonClass } from '@/components/ui/IconButton'
import { ClockCounterClockwise, ICON_WEIGHT, X } from '@/components/ui/icons'
import { clearSearches, clearVideos, removeSearch } from '@/features/history/history'
import { useHistory } from '@/features/history/useHistory'

/**
 * 검색 전 첫 화면 맨 위. 최근 검색어와 최근 본 영상.
 *
 * 기록은 localStorage 에만 있어 서버 렌더에서는 항상 비어 있다. 비어 있으면 아무것도
 * 그리지 않으므로 하이드레이션 전에 "없음"이 번쩍이는 문제가 생기지 않는다.
 */
export default function RecentPanel() {
  const { searches, videos } = useHistory()
  if (searches.length === 0 && videos.length === 0) return null

  return (
    <div className="mb-8 space-y-6">
      {searches.length > 0 ? (
        <section aria-labelledby="recent-search-heading">
          <SectionHeader
            id="recent-search-heading"
            title="최근 검색"
            clearLabel="최근 검색 전체 지우기"
            onClear={clearSearches}
          />
          <ul className="mt-3 flex flex-wrap gap-2">
            {searches.map((query) => (
              <li key={query} className="relative">
                <Link
                  href={`/?q=${encodeURIComponent(query)}`}
                  data-testid="recent-search"
                  className={`${chipClass(false, 'md')} pr-9`}
                >
                  {query}
                </Link>
                <button
                  type="button"
                  aria-label={`${query} 검색 기록 지우기`}
                  onClick={() => removeSearch(query)}
                  className={iconButtonClass('ghost', 'sm', 'absolute top-1 right-1 rounded-full')}
                >
                  <X size={12} weight={ICON_WEIGHT} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {videos.length > 0 ? (
        <section aria-labelledby="recent-video-heading">
          <SectionHeader
            id="recent-video-heading"
            title="최근 본 영상"
            clearLabel="최근 본 영상 전체 지우기"
            onClear={clearVideos}
          />
          {/* 한 줄로 흘려 둔다. 첫 화면에서 인기 운동을 아래로 밀어내지 않는다. */}
          <ul className="scrollbar-none -mx-4 mt-3 flex gap-3 overflow-x-auto px-4 pb-1">
            {videos.map((video, index) => (
              <li key={video.id} className="w-24 shrink-0">
                <Link
                  href={`/feed?recent=1&i=${index}`}
                  data-testid="recent-video"
                  className="group block rounded-xl"
                >
                  <div className="relative aspect-[9/16] overflow-hidden rounded-xl bg-surface2 ring-1 ring-border/70 ring-inset">
                    <Image
                      src={video.thumbnailUrl}
                      alt=""
                      fill
                      sizes="96px"
                      className="object-cover transition-transform duration-300 ease-out-quint group-hover:scale-[1.04]"
                    />
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-xs leading-snug text-muted group-hover:text-text">
                    {video.title}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

function SectionHeader({
  id,
  title,
  clearLabel,
  onClear,
}: {
  id: string
  title: string
  clearLabel: string
  onClear: () => void
}) {
  return (
    <div className="flex items-center gap-2">
      <ClockCounterClockwise size={16} weight={ICON_WEIGHT} aria-hidden className="text-dim" />
      <h2 id={id} className="text-sm font-semibold tracking-tight text-text">
        {title}
      </h2>
      <button
        type="button"
        aria-label={clearLabel}
        onClick={onClear}
        className="ml-auto text-xs text-dim hover:text-text"
      >
        전체 지우기
      </button>
    </div>
  )
}
