'use client'

import CategoryChips from '@/components/CategoryChips'
import SearchBar from '@/components/SearchBar'

/**
 * reset() 은 에러 상태만 지우고 서버 데이터를 재요청하지 않는다.
 * 네트워크 실패 회복에는 재요청이 필요하므로 unstable_retry() 를 쓴다.
 *
 * page.tsx의 전체 서브트리(검색창, 카테고리 칩 포함)를 이 컴포넌트가 대체하므로,
 * 검색창과 칩을 여기서도 그려야 실패한 검색에서 사용자가 다른 검색어로 다시
 * 시도하거나 카테고리로 빠져나갈 방법이 생긴다. 그러지 않으면 재시도 버튼이
 * 실패하는 경우(예: 잘못된 API 키) 브라우저 뒤로가기 말고는 나갈 길이 없다.
 * SearchBar/CategoryChips는 서버 전용 의존성이 없는 순수 표시용 컴포넌트라
 * 클라이언트 컴포넌트에서 가져와도 안전하다. 실패한 검색어는 알 수 없으므로
 * defaultValue는 비워 둔다.
 */
export default function TabsError({
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">어떤 운동을 볼까요</h1>
      <SearchBar />
      <CategoryChips />

      <div
        data-testid="error-state"
        className="rounded-xl border border-danger/40 bg-danger/10 p-5 text-center"
      >
        <p className="text-sm text-text">영상을 불러오지 못했어요.</p>
        <p className="mt-1 text-xs text-muted">네트워크를 확인한 뒤 다시 시도해 주세요.</p>
        <button
          type="button"
          onClick={() => unstable_retry()}
          className="mt-4 h-10 rounded-xl bg-accent px-5 text-sm font-semibold text-bg"
        >
          다시 시도
        </button>
      </div>
    </div>
  )
}
