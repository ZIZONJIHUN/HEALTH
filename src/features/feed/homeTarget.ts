/**
 * 피드의 홈 버튼이 돌아갈 곳을 고른다. 순수 함수라 브라우저 없이 테스트한다.
 *
 * 휴대폰 브라우저에서는 YouTube iframe 안의 이동이 방문 기록에 쌓여, 뒤로가기가 영상을 하나씩
 * 되짚는다. Navigation API 의 entries() 는 이 페이지 자신의 기록만 담고 iframe 안의 이동은 담지
 * 않으므로, 거기서 원래 화면을 찾아 traverseTo 하면 몇 개를 넘겼든 한 번에 돌아간다.
 */

/** 검색 피드가 돌아갈 그리드 주소. 그리드가 피드로 넘긴 조건(VideoGrid.tsx)을 그대로 되돌린다. */
export function searchHomeHref(params: { q: string; len?: string; pages?: string }): string {
  const search = new URLSearchParams({ q: params.q })
  if (params.len) search.set('len', params.len)
  if (params.pages) search.set('pages', params.pages)
  return `/?${search.toString()}`
}

export type HistoryEntry = { key: string; url: string | null }

/** 같은 화면인가 — 경로와 검색 조건(q·len·pages)이 같다. 다른 조건의 그리드로 돌아가면 엉뚱한 결과가 보인다. */
function sameScreen(entryUrl: string, href: string): boolean {
  const entry = new URL(entryUrl)
  const target = new URL(href, entry.origin)
  if (entry.pathname !== target.pathname) return false
  return ['q', 'len', 'pages'].every(
    (name) => entry.searchParams.get(name) === target.searchParams.get(name),
  )
}

/**
 * 지금(currentIndex)보다 앞에 있는 항목 중 href 와 같은 화면인 가장 가까운 것의 key. 없으면 null.
 * 앞으로 가기 쪽은 보지 않는다 — 사용자가 떠나온 화면이 아니다.
 */
export function findReturnEntry(
  entries: readonly HistoryEntry[],
  currentIndex: number,
  href: string,
): string | null {
  for (let i = Math.min(currentIndex, entries.length) - 1; i >= 0; i -= 1) {
    const url = entries[i].url
    if (url !== null && sameScreen(url, href)) return entries[i].key
  }
  return null
}
