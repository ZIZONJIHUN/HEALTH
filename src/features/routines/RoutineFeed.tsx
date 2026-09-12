'use client'

import Link from 'next/link'
import MessageCard from '@/components/ui/MessageCard'
import ShortsFeed from '@/features/feed/ShortsFeed'
import { ICON_WEIGHT, ListChecks } from '@/components/ui/icons'
import { BUTTON_PRIMARY } from '@/components/ui/Button'
import { useHydrated } from '@/lib/useHydrated'
import { useRoutines } from '@/features/routines/useRoutines'

/**
 * 루틴 재생. 검색 피드와 달리 서버에서 영상 목록을 가져오지 않는다 —
 * 루틴은 localStorage 에만 있고, 담을 때 영상 메타데이터를 통째로 저장해 뒀다.
 * 덕분에 루틴을 몇 번 돌려도 YouTube 쿼터를 쓰지 않는다.
 */
export default function RoutineFeed({
  routineId,
  requestedIndex,
}: {
  routineId: string
  requestedIndex: number
}) {
  const routines = useRoutines()
  // 서버 렌더에는 루틴이 없다. 하이드레이션 전에는 "없음"으로 단정하면 안 된다.
  const hydrated = useHydrated()

  const routine = routines.find((item) => item.id === routineId)

  if (!hydrated) {
    return (
      <div data-feed-root="" className="flex h-dvh items-center justify-center bg-black">
        <div className="skeleton h-3/5 w-[min(90vw,280px)] rounded-2xl" />
      </div>
    )
  }

  if (!routine || routine.items.length === 0) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg px-6">
        <MessageCard
          testId="routine-missing"
          icon={<ListChecks size={22} weight={ICON_WEIGHT} aria-hidden />}
          title={routine ? '이 루틴은 비어 있어요.' : '루틴을 찾을 수 없어요.'}
          description="루틴은 이 브라우저에만 저장돼요. 다른 기기에서 만든 루틴은 보이지 않아요."
          actions={
            <Link href="/routines" className={BUTTON_PRIMARY}>
              루틴 보러가기
            </Link>
          }
        />
      </div>
    )
  }

  const initialIndex = Math.min(Math.max(requestedIndex, 0), routine.items.length - 1)

  return (
    <ShortsFeed
      videos={routine.items}
      initialIndex={initialIndex}
      routineName={routine.name}
    />
  )
}
