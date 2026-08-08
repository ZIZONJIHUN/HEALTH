'use client'

import { useEffect, useRef, useState } from 'react'
import FeedSlide from '@/components/FeedSlide'
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

  return (
    <div
      ref={containerRef}
      className="h-dvh snap-y snap-mandatory overflow-y-scroll overscroll-contain"
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
  )
}
