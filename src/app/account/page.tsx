import type { Metadata } from 'next'
import AccountPanel from '@/features/account/AccountPanel'
import { getAccountUser } from '@/features/account/session'
import { firstParam } from '@/features/search/searchParams'

export const metadata: Metadata = {
  title: '내 정보',
}

/**
 * 단계 A 에서는 탭바에 넣지 않는다. 주소로만 닿는다.
 *
 * 로그인해도 사용자에게 달라지는 것이 없기 때문이다 — "동기화됨" 은 거짓이고
 * 아무 말도 안 하면 왜 로그인했는지 알 수 없다. 루틴 동기화(단계 B)가 끝날 때
 * TABS 에 추가해 함께 노출한다.
 */
export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ auth?: string | string[] }>
}) {
  const params = await searchParams
  const raw = firstParam(params.auth)
  const notice = raw === 'failed' || raw === 'unconfigured' ? raw : null

  const user = await getAccountUser()

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <header>
        <h1 className="text-[26px] font-extrabold tracking-tight sm:text-3xl md:text-[32px]">
          내 정보
        </h1>
      </header>

      <div className="mt-7">
        <AccountPanel user={user} notice={notice} />
      </div>
    </div>
  )
}
