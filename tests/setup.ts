import { afterEach } from 'vitest'
import { resetApiBudgetForTest } from '@/lib/apiBudget'
import { clearMemoryCache } from '@/lib/searchCache'

/**
 * searchCache 와 apiBudget 은 모듈 수준 상태를 들고 있다.
 * 파일마다 비우는 것을 기억하는 대신 전역으로 비운다.
 * 빠뜨리면 테스트가 실패하지 않고 조용히 캐시 히트를 받거나 예산을 소진해서,
 * 검증하려던 경로가 아예 실행되지 않는 채로 통과한다.
 */
afterEach(() => {
  clearMemoryCache()
  resetApiBudgetForTest()
})
