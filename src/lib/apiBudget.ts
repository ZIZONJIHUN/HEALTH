import { getSupabaseClient, TIMED_OUT, withTimeout } from './supabase'

/**
 * YouTube 호출 횟수를 하루 단위로 센다.
 *
 * 왜 필요한가. 검색 1회는 search.list 100 + videos.list 1 = 101 units 이고 일일 무료
 * 쿼터는 10,000 units 다. 즉 하루 약 99회가 물리적 상한이다. 캐시에 없는 검색어는
 * 누구든 URL 하나로 만들어 낼 수 있으므로(`/?q=<아무거나>`), 아무 제동장치가 없으면
 * 100번의 요청으로 그날 서비스 전체의 검색이 죽는다. 그 상태에서는 stale 캐시조차
 * 없어서 사용자에게 빈 화면만 남는다.
 *
 * 상한에 닿으면 QuotaExceededError 와 똑같이 처리된다 — 이미 캐시된 검색어는 계속
 * 보이고 배너가 뜬다. 실제 쿼터가 0이 되기 전에 앱이 스스로 멈춰서, "저장된 것은
 * 볼 수 있는 상태"를 지켜낸다.
 */

/**
 * 하루에 허용할 YouTube 검색 횟수.
 *
 * 80 × 101 = 8,080 units 로 일일 10,000 의 80% 다. 나머지 20% 는 시드 스크립트
 * (`npm run seed`, 45건)가 예산과 별개로 돌 수 있는 여유이자 계산 착오의 완충이다.
 */
export const DAILY_CALL_LIMIT = 80

const RPC = 'consume_api_budget'

type MemoryBudget = { day: string; calls: number }

/**
 * Supabase 가 없거나 응답하지 않을 때 쓰는 프로세스 내 카운터.
 * 인스턴스 간에 공유되지 않으므로 여러 인스턴스가 뜨면 상한이 인스턴스 수만큼 곱해진다.
 * 완벽한 방어는 Supabase 쪽뿐이고, 이것은 최소한의 제동이다.
 */
let memoryBudget: MemoryBudget = { day: '', calls: 0 }

/** 로컬 자정 기준. 정확한 UTC 경계보다 "하루에 한 번 리셋"이라는 성질이 중요하다. */
function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function consumeMemory(): boolean {
  const day = today()
  if (memoryBudget.day !== day) memoryBudget = { day, calls: 0 }
  if (memoryBudget.calls >= DAILY_CALL_LIMIT) return false
  memoryBudget.calls += 1
  return true
}

/** 테스트 전용. 프로세스 내 카운터를 비운다. */
export function resetApiBudgetForTest(): void {
  memoryBudget = { day: '', calls: 0 }
}

/**
 * Supabase 쪽 판정이 불가능할 때 메모리 카운터로 내려간다.
 * 검사에 실패했다고 무제한으로 열어 주면 이 방어의 존재 이유가 사라지고,
 * 반대로 검색을 막아버리면 캐시 장애가 곧 기능 장애가 된다.
 */
function fallback(reason: string): boolean {
  console.warn(`[api_budget] 확인 실패 — 메모리 카운터로 대체합니다: ${reason}`)
  return consumeMemory()
}

/**
 * 호출 예산을 1 소비하고 허용 여부를 돌려준다.
 *
 * Supabase 가 있으면 원자적 test-and-increment(RPC)를 쓴다. 읽고-더하고-쓰면 동시
 * 요청 사이에 경쟁이 생겨서 상한을 넘길 수 있다.
 *
 * 예산 확인 자체가 실패하는 경우(마이그레이션 미실행, 네트워크 장애)에는 메모리
 * 카운터로 내려간다. 검사에 실패했다고 무제한으로 열어 주면 이 방어의 존재 이유가
 * 사라지고, 반대로 검색을 막아버리면 캐시 장애가 기능 장애가 된다.
 */
export async function consumeApiBudget(): Promise<boolean> {
  const client = getSupabaseClient()
  if (!client) return consumeMemory()

  try {
    const result = await withTimeout(client.rpc(RPC, { max_calls: DAILY_CALL_LIMIT }))

    if (result === TIMED_OUT) {
      return fallback('응답이 없습니다')
    }
    if (result.error) {
      return fallback(result.error.message)
    }
    // 상한에 닿으면 갱신된 행이 없어 null 이 온다.
    return result.data !== null
  } catch (cause) {
    return fallback(cause instanceof Error ? cause.message : String(cause))
  }
}
