import type { Metadata } from 'next'
import AccountPanel from '@/features/account/AccountPanel'
import { getAccountUser } from '@/features/account/session'
import { firstParam } from '@/features/search/searchParams'

export const metadata: Metadata = {
  title: '설정',
}

/**
 * 탭바의 세 번째 자리.
 *
 * 처음에는 루틴 동기화가 끝날 때까지 숨겨 둘 생각이었다 — 로그인해도 달라지는 것이
 * 없어서였다. 그런데 그러면 **로그인 자체를 할 방법이 없다.** 아직 못 하는 일을
 * 화면에서 솔직히 말하는 편이, 기능을 숨겨서 닿지 못하게 하는 것보다 낫다.
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
    <div className="mx-auto max-w-2xl">
      <header>
        <h1 className="text-[26px] font-extrabold tracking-tight sm:text-3xl md:text-[32px]">
          설정
        </h1>
      </header>

      <div className="mt-7">
        <AccountPanel user={user} notice={notice} />
      </div>
    </div>
  )
}
