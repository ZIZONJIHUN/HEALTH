'use client'

import MessageCard from '@/components/ui/MessageCard'
import SearchHeader from '@/features/search/SearchHeader'
import { ArrowClockwise, ICON_WEIGHT, WarningCircle } from '@/components/ui/icons'
import { BUTTON_PRIMARY } from '@/components/ui/Button'

/**
 * reset() 은 에러 상태만 지우고 서버 데이터를 재요청하지 않는다.
 * 네트워크 실패 회복에는 재요청이 필요하므로 retry() 를 쓴다.
 * (Next 16.2 의 unstable_retry 가 16.3 에서 retry 로 안정화됐다.)
 *
 * page.tsx의 전체 서브트리(검색창, 카테고리 칩 포함)를 이 컴포넌트가 대체하므로,
 * 검색창과 칩을 여기서도 그려야 실패한 검색에서 사용자가 다른 검색어로 다시
 * 시도하거나 카테고리로 빠져나갈 방법이 생긴다. 그러지 않으면 재시도 버튼이
 * 실패하는 경우(예: 잘못된 API 키) 브라우저 뒤로가기 말고는 나갈 길이 없다.
 * SearchHeader 는 서버 전용 의존성이 없는 순수 표시용이라 클라이언트 컴포넌트에서
 * 가져와도 안전하다. 실패한 검색어는 알 수 없으므로 query 는 비워 둔다.
 */
export default function TabsError({
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  return (
    <div className="space-y-6">
      <SearchHeader />

      <div className="flex justify-center pt-2">
        <MessageCard
          tone="danger"
          testId="error-state"
          icon={<WarningCircle size={22} weight={ICON_WEIGHT} aria-hidden />}
          title="영상을 불러오지 못했어요."
          description="네트워크를 확인한 뒤 다시 시도해 주세요."
          actions={
            <button type="button" onClick={() => retry()} className={BUTTON_PRIMARY}>
              <ArrowClockwise size={15} weight={ICON_WEIGHT} aria-hidden />
              다시 시도
            </button>
          }
        />
      </div>
    </div>
  )
}
