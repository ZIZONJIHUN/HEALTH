'use client'

import Link from 'next/link'
import { retrySync, useSyncStatus } from './syncStatus'

/**
 * 루틴이 지금 어디에 저장돼 있는지 한 줄로 말한다.
 * 서버 HTML 과 첫 하이드레이션은 useSyncStatus 가 local 로 맞춰 주므로 여기서 따로 막지 않는다.
 * 조용한 실패를 두지 않으려고 pending·rejected 도 숨기지 않고 보여 준다.
 */
export default function SyncStatusLine() {
  const status = useSyncStatus()

  return (
    <p data-testid="sync-status" className="mt-1 text-xs text-dim">
      {status.state === 'local' && (
        <>
          루틴은 이 브라우저에만 저장돼요.{' '}
          <Link href="/account" className="text-accent underline-offset-2 hover:underline">
            로그인하면 다른 기기에서도 볼 수 있어요
          </Link>
        </>
      )}
      {status.state === 'synced' && '계정에 저장돼요. 다른 기기에서도 보여요.'}
      {status.state === 'pending' && (
        <>
          아직 계정에 저장되지 않았어요{' '}
          <button
            type="button"
            onClick={retrySync}
            className="text-accent underline-offset-2 hover:underline"
          >
            다시 시도
          </button>
        </>
      )}
      {status.state === 'rejected' && (
        <span className="text-danger">
          {status.names.join(', ')} 루틴은 계정에 저장할 수 없어요 · {status.reason}
        </span>
      )}
    </p>
  )
}
