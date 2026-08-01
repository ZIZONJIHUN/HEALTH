'use client'

/**
 * reset() 은 에러 상태만 지우고 서버 데이터를 재요청하지 않는다.
 * 네트워크 실패 회복에는 재요청이 필요하므로 unstable_retry() 를 쓴다.
 */
export default function TabsError({
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  return (
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
  )
}
