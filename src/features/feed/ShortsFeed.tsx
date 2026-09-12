'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import FeedSlide from '@/features/feed/FeedSlide'
import { iconButtonClass } from '@/components/ui/IconButton'
import { FEED_PLAYER_BOX } from '@/features/feed/feedPlayerBox'
import { ArrowRight, CaretDown, CaretUp, ICON_WEIGHT, X } from '@/components/ui/icons'
import type { ShortVideo } from '@/lib/types'

/** 현재 슬라이드 기준 앞뒤 몇 개까지 iframe을 마운트할지. */
const MOUNT_WINDOW = 1

/** 영상이 끝났을 때 "다음으로 해보세요"에 몇 개까지 보여줄지. */
const NEXT_UP_COUNT = 3

export default function ShortsFeed({
  videos,
  initialIndex,
  routineName,
}: {
  videos: ShortVideo[]
  initialIndex: number
  /** 있으면 루틴 재생이다. 반복을 끄고 끝나면 다음 운동을 권한다. */
  routineName?: string
}) {
  const [activeIndex, setActiveIndex] = useState(initialIndex)
  const [endedIndex, setEndedIndex] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const slideRefs = useRef<Array<HTMLDivElement | null>>([])
  const routineMode = routineName != null

  // 그리드에서 누른 영상으로 바로 이동한다.
  useEffect(() => {
    slideRefs.current[initialIndex]?.scrollIntoView({ block: 'start' })
  }, [initialIndex])

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const index = Number((entry.target as HTMLElement).dataset.index)
          if (Number.isNaN(index)) continue
          setActiveIndex(index)
          // 슬라이드가 바뀌면 이전 영상의 종료 화면은 의미가 없다.
          // 멈춰 있는 슬라이드는 관찰자를 다시 깨우지 않으므로 방금 뜬 종료 화면을 지우지 않는다.
          setEndedIndex(null)
        }
      },
      { root: containerRef.current, threshold: 0.6 },
    )

    for (const slide of slideRefs.current) {
      if (slide) observer.observe(slide)
    }
    return () => observer.disconnect()
  }, [videos.length])

  // FeedSlide 로 내려가는 참조가 렌더마다 바뀌면 종료 감지 구독이 계속 끊겼다 붙는다.
  const handleEnded = useCallback((index: number) => setEndedIndex(index), [])

  const goTo = useCallback(
    (index: number) => {
      const clamped = Math.min(Math.max(index, 0), videos.length - 1)
      setEndedIndex(null)
      slideRefs.current[clamped]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    },
    [videos.length],
  )

  /**
   * 데스크톱에서 마우스 휠로 한 칸씩 넘기는 건 스냅이 알아서 해주지만, 키보드로는
   * 방법이 없었다. 영상 위로 포커스가 넘어간 뒤(=YouTube iframe 안)에는 키 이벤트가
   * 이쪽으로 오지 않는다. 그건 iframe 경계라 어쩔 수 없고, 화살표 버튼으로 보완한다.
   */
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return

      switch (event.key) {
        case 'ArrowDown':
        case 'PageDown':
          goTo(activeIndex + 1)
          break
        case 'ArrowUp':
        case 'PageUp':
          goTo(activeIndex - 1)
          break
        case 'Home':
          goTo(0)
          break
        case 'End':
          goTo(videos.length - 1)
          break
        default:
          return
      }
      event.preventDefault()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeIndex, goTo, videos.length])

  const atFirst = activeIndex <= 0
  const atLast = activeIndex >= videos.length - 1
  const nextUp = videos.slice(activeIndex + 1, activeIndex + 1 + NEXT_UP_COUNT)

  return (
    // data-feed-root: globals.css 가 이 속성을 보고 바깥 스크롤과 스크롤바 자리를 끈다.
    <div data-feed-root="" className="relative h-dvh bg-black">
      <div
        ref={containerRef}
        className="scrollbar-none h-dvh snap-y snap-mandatory overflow-y-scroll overscroll-contain"
      >
        {videos.map((video, index) => (
          <div
            key={video.id}
            data-index={index}
            data-testid="feed-slide"
            ref={(element) => {
              slideRefs.current[index] = element
            }}
            className="h-dvh w-full snap-start snap-always"
          >
            <FeedSlide
              video={video}
              index={index}
              active={Math.abs(index - activeIndex) <= MOUNT_WINDOW}
              autoplay={index === activeIndex}
              onEnded={handleEnded}
            />
          </div>
        ))}
      </div>

      {routineMode ? (
        <p className="pointer-events-none absolute top-3 left-1/2 z-50 max-w-[50%] -translate-x-1/2 truncate rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-accent backdrop-blur-sm">
          {routineName}
        </p>
      ) : null}

      <p
        aria-live="polite"
        className="tabular pointer-events-none absolute top-3 right-3 z-50 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-text backdrop-blur-sm"
      >
        <span className="sr-only">전체 {videos.length}개 중 </span>
        {activeIndex + 1} / {videos.length}
      </p>

      {/* 모바일은 스와이프로 넘긴다. 마우스에는 눌러서 넘길 것이 필요하다.
          플레이어 박스를 투명하게 한 번 더 그려서 버튼을 그 바깥에 붙인다.
          화면 오른쪽 끝에 두면 넓은 창에서 영상과 수백 px 떨어져 따로 논다. */}
      <div className="pointer-events-none absolute inset-0 z-50 hidden items-center justify-center md:flex">
        <div className={`relative h-full ${FEED_PLAYER_BOX}`}>
          <div className="pointer-events-auto absolute top-1/2 -right-14 flex -translate-y-1/2 flex-col gap-3">
            <FeedNavButton
              label="이전 영상"
              disabled={atFirst}
              onClick={() => goTo(activeIndex - 1)}
            >
              <CaretUp size={18} weight={ICON_WEIGHT} aria-hidden />
            </FeedNavButton>
            <FeedNavButton label="다음 영상" disabled={atLast} onClick={() => goTo(activeIndex + 1)}>
              <CaretDown size={18} weight={ICON_WEIGHT} aria-hidden />
            </FeedNavButton>
          </div>
        </div>
      </div>

      {endedIndex === activeIndex ? (
        <NextUpPanel
          nextUp={nextUp}
          finishedLabel={routineMode ? '루틴을 끝냈어요' : '마지막 영상이었어요'}
          startIndex={activeIndex + 1}
          onPick={goTo}
          onDismiss={() => setEndedIndex(null)}
        />
      ) : null}
    </div>
  )
}

/**
 * 영상이 끝나면 뜨는 "다음으로 해보세요". 검색 피드와 루틴 재생 모두에서 뜬다.
 *
 * 자동 감지(useVideoEnded)가 실패하는 환경이 있을 수 있어, 이 화면이 안 떠도
 * 사용자는 스와이프나 화살표 버튼으로 다음 영상에 갈 수 있다. 여기는 지름길이다.
 */
function NextUpPanel({
  nextUp,
  startIndex,
  finishedLabel,
  onPick,
  onDismiss,
}: {
  nextUp: ShortVideo[]
  startIndex: number
  finishedLabel: string
  onPick: (index: number) => void
  onDismiss: () => void
}) {
  return (
    <div
      data-testid="next-up"
      className="absolute inset-x-0 bottom-0 z-50 mx-auto w-full max-w-md rounded-t-2xl border-t border-border bg-bg/95 p-4 backdrop-blur-xl"
      style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-text">
          {nextUp.length ? '다음으로 해보세요' : finishedLabel}
        </p>
        <button
          type="button"
          aria-label="닫기"
          onClick={onDismiss}
          className={iconButtonClass('ghost', 'sm', '-mt-1 -mr-1')}
        >
          <X size={14} weight={ICON_WEIGHT} aria-hidden />
        </button>
      </div>

      {nextUp.length === 0 ? (
        <p className="mt-2 text-xs text-muted">수고했어요. 위로 넘겨 다시 볼 수 있어요.</p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {nextUp.map((video, offset) => (
            <li key={video.id}>
              <button
                type="button"
                onClick={() => onPick(startIndex + offset)}
                className="flex w-full items-center gap-2.5 rounded-xl border border-border bg-surface px-3 py-2.5 text-left hover:border-accent-dim hover:bg-surface2"
              >
                <span aria-hidden className="text-sm">
                  🔥
                </span>
                <span className="line-clamp-1 flex-1 text-[13px] font-medium text-text">
                  {video.title}
                </span>
                <ArrowRight size={14} weight={ICON_WEIGHT} aria-hidden className="text-dim" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function FeedNavButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={iconButtonClass('overlay', 'lg')}
    >
      {children}
    </button>
  )
}
