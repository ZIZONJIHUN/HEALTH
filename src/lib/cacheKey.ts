/** 캐시 키로 쓸 수 있게 검색어를 정규화한다. */
export function normalizeQuery(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ')
}
