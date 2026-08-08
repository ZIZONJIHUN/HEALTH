'use client'

import { useRouter } from 'next/navigation'

/**
 * Link 로 그리드로 되돌아가면 히스토리가 쌓여 스크롤 위치가 복원되지 않는다.
 * 실제 뒤로가기를 써야 브라우저가 그리드의 스크롤 위치를 되돌려준다.
 */
export default function BackButton() {
  const router = useRouter()

  return (
    <button
      type="button"
      onClick={() => router.back()}
      data-testid="back-button"
      aria-label="뒤로"
      className="fixed left-3 top-3 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-lg text-text"
    >
      ←
    </button>
  )
}
