/**
 * 검색어 정규화는 두 가지 일을 동시에 한다: 캐시 키를 만들고, YouTube 에 넘길 인자를 만든다.
 * 그래서 여기가 사용자 입력이 시스템 안으로 들어오는 유일한 관문이고, 검증도 여기 붙는다.
 */

/**
 * 정규화 후 이 길이를 넘으면 검색하지 않는다.
 *
 * 실제 검색어 중 가장 긴 것은 '트라이셉스익스텐션'(9자)과 '전면 삼각근 운동'(9자)이다.
 * 40 은 네 배 넘는 여유다. 상한이 없으면 10KB 짜리 문자열이 그대로 캐시 테이블의
 * 기본키가 되고, 검색 한 번이 101 units 인 이 앱에서는 무작위 장문 검색어 100번이
 * 하루치 쿼터 전체다.
 */
export const MAX_QUERY_LENGTH = 40

/**
 * 제어문자와 서식문자(zero-width 류)를 공백으로 바꾼다.
 * 눈에 보이지 않으면서 캐시 키만 달라지게 만드는 문자들이라, 같은 검색어가
 * 서로 다른 행으로 흩어져 쿼터를 두 번 태우는 것을 막는다.
 */
const INVISIBLE = /[\p{Cc}\p{Cf}]/gu

/** 캐시 키로 쓸 수 있게 검색어를 정규화한다. */
export function normalizeQuery(raw: string): string {
  return raw.replace(INVISIBLE, ' ').trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * 정규화된 검색어로 YouTube 를 호출해도 되는지 판정한다.
 * 빈 문자열은 호출할 것이 없고, 과하게 긴 값은 사람이 친 검색어가 아니다.
 */
export function isSearchableQuery(query: string): boolean {
  return query.length > 0 && query.length <= MAX_QUERY_LENGTH
}
