import { afterEach } from 'vitest'
import { clearMemoryCache } from '@/lib/searchCache'

/**
 * searchCache 는 모듈 수준 Map 을 들고 있다.
 * 파일마다 비우는 것을 기억하는 대신 전역으로 비운다.
 * 빠뜨리면 테스트가 실패하지 않고 조용히 캐시 히트를 받아 무의미해진다.
 */
afterEach(() => {
  clearMemoryCache()
})
