'use client'

import Link from 'next/link'
import MessageCard from '@/components/ui/MessageCard'
import ShortsFeed from '@/features/feed/ShortsFeed'
import { ClockCounterClockwise, ICON_WEIGHT } from '@/components/ui/icons'
import { BUTTON_PRIMARY } from '@/components/ui/Button'
import { useHydrated } from '@/lib/useHydrated'
import { useHistory } from '@/features/history/useHistory'

/**
 * 최근 본 영상 다시 보기. RoutineFeed 처럼 저장해 둔 메타데이터만 쓴다.
 *
 * 여기서 본 영상은 기록하지 않는다(recordViews={false}). 기록하면 넘길 때마다 목록
 * 맨 앞으로 올라가 보고 있는 목록의 순서가 발밑에서 바뀐다.
 */
export default function RecentFeed({ requestedIndex }: { requestedIndex: number }) {
  const { videos } = useHistory()
  const hydrated = useHydrated()

  if (!hydrated) {
    return (
      <div data-feed-root="" className="flex h-dvh items-center justify-center bg-black">
        <div className="skeleton h-3/5 w-[min(90vw,280px)] rounded-2xl" />
      </div>
    )
  }

  if (videos.length === 0) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg px-6">
        <MessageCard
          testId="recent-missing"
          icon={<ClockCounterClockwise size={22} weight={ICON_WEIGHT} aria-hidden />}
          title="최근 본 영상이 없어요."
          description="본 영상은 이 브라우저에만 기록돼요."
          actions={
            <Link href="/" className={BUTTON_PRIMARY}>
              운동 찾으러 가기
            </Link>
          }
        />
      </div>
    )
  }

  const initialIndex = Math.min(Math.max(requestedIndex, 0), videos.length - 1)

  return <ShortsFeed videos={videos} initialIndex={initialIndex} recordViews={false} />
}
