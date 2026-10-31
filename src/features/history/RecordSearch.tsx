'use client'

import { useEffect } from 'react'
import { recordSearch } from '@/features/history/history'

/**
 * 검색 결과가 그려질 때 검색어를 남긴다. 아무것도 그리지 않는다.
 *
 * 검색 상태는 URL 에만 있어서 폼 제출, 칩, 인체도, 뒤로가기 등 들어오는 길이 여럿이다.
 * 제출 시점마다 붙이는 대신 결과가 그려지는 한 곳에서 남긴다.
 */
export default function RecordSearch({ query }: { query: string }) {
  useEffect(() => {
    recordSearch(query)
  }, [query])

  return null
}
