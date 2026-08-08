'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import FeedSlide from '@/components/FeedSlide'
import { FEED_PLAYER_BOX } from '@/components/feedPlayerBox'
import { CaretDown, CaretUp, ICON_WEIGHT } from '@/components/icons'
import type { ShortVideo } from '@/lib/types'

/** 현재 슬라이드 기준 앞뒤 몇 개까지 iframe을 마운트할지. */
const MOUNT_WINDOW = 1

export default function ShortsFeed({
  videos,
  initialIndex,
}: {
  videos: ShortVideo[]
  initialIndex: number
}) {
  const [activeIndex, setActiveIndex] = useState(initialIndex)
  const containerRef = useRef<HTMLDivElement>(null)
  const slideRefs = useRef<Array<HTMLDivElement | null>>([])

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
          if (!Number.isNaN(index)) setActiveIndex(index)
        }
      },
      { root: containerRef.current, threshold: 0.6 },
    )

    for (const slide of slideRefs.current) {
      if (slide) observer.observe(slide)
    }
    return () => observer.disconnect()
  }, [videos.length])

  const goTo = useCallback(
    (index: number) => {
      const clamped = Math.min(Math.max(index, 0), videos.length - 1)
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
              active={Math.abs(index - activeIndex) <= MOUNT_WINDOW}
              autoplay={index === activeIndex}
            />
          </div>
        ))}
      </div>

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
      className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-black/50 text-text backdrop-blur-md hover:border-accent-dim hover:bg-black/70 hover:text-accent disabled:pointer-events-none disabled:opacity-30"
    >
      {children}
    </button>
  )
}
