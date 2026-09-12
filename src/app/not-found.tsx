import Link from 'next/link'
import MessageCard from '@/components/ui/MessageCard'
import { ICON_WEIGHT, SmileyMeh } from '@/components/ui/icons'
import { BUTTON_PRIMARY } from '@/components/ui/Button'

/**
 * getVideos 가 videos: [] 를 돌려주는 경로(예: /feed 에서 quotaExceeded && 캐시 없음)와
 * 존재하지 않는 경로 모두 여기로 온다. Next 기본 404는 흰 배경의 영어 페이지라
 * 다크 모드 한국어 앱 안에서 눈에 띄게 깨져 보인다.
 */
export default function NotFound() {
  return (
    <main id="main" className="flex min-h-dvh items-center justify-center bg-bg px-6">
      <MessageCard
        testId="not-found-state"
        icon={<SmileyMeh size={22} weight={ICON_WEIGHT} aria-hidden />}
        title="페이지를 찾을 수 없어요."
        description="주소가 바뀌었거나 더 이상 존재하지 않아요."
        actions={
          <Link href="/" className={BUTTON_PRIMARY}>
            홈으로
          </Link>
        }
      />
    </main>
  )
}
