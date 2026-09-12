'use client'

import Link from 'next/link'
import MessageCard from '@/components/MessageCard'
import { ArrowClockwise, ICON_WEIGHT, WarningCircle } from '@/components/icons'
import { BUTTON_PRIMARY, BUTTON_SECONDARY } from '@/components/styles'

/**
 * reset() 은 에러 상태만 지우고 서버 데이터를 재요청하지 않는다.
 * 네트워크 실패 회복에는 재요청이 필요하므로 retry() 를 쓴다.
 * (tabs)/error.tsx 와 같은 이유, 같은 props 형태.
 */
export default function FeedError({
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg px-6">
      <MessageCard
        tone="danger"
        testId="error-state"
        icon={<WarningCircle size={22} weight={ICON_WEIGHT} aria-hidden />}
        title="영상을 불러오지 못했어요."
        description="네트워크를 확인한 뒤 다시 시도해 주세요."
        actions={
          <>
            <button type="button" onClick={() => retry()} className={BUTTON_PRIMARY}>
              <ArrowClockwise size={15} weight={ICON_WEIGHT} aria-hidden />
              다시 시도
            </button>
            <Link href="/" className={BUTTON_SECONDARY}>
              홈으로
            </Link>
          </>
        }
      />
    </div>
  )
}
