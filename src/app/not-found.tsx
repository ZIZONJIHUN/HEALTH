import Link from 'next/link'

/**
 * getVideos 가 videos: [] 를 돌려주는 경로(예: /feed 에서 quotaExceeded && 캐시 없음)와
 * 존재하지 않는 경로 모두 여기로 온다. Next 기본 404는 흰 배경의 영어 페이지라
 * 다크 모드 한국어 앱 안에서 눈에 띄게 깨져 보인다.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-bg px-6 text-center">
      <div
        data-testid="not-found-state"
        className="rounded-xl border border-border bg-surface p-6"
      >
        <p className="text-sm text-text">페이지를 찾을 수 없어요.</p>
        <p className="mt-1 text-xs text-muted">주소가 바뀌었거나 더 이상 존재하지 않아요.</p>
        <Link
          href="/"
          className="mt-4 inline-flex h-10 items-center justify-center rounded-xl bg-accent px-5 text-sm font-semibold text-bg"
        >
          홈으로
        </Link>
      </div>
    </div>
  )
}
