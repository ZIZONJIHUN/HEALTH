'use client'

import { useRef, useState } from 'react'
import { ICON_WEIGHT, MagnifyingGlass, X } from '@/components/icons'

/**
 * GET 폼이라 자바스크립트 없이도 동작하고, 검색 상태가 URL에 남는다.
 *
 * 값을 상태로 들고 있는 이유는 지우기(×) 버튼 때문만이 아니다. defaultValue 로 두면
 * 카테고리 칩을 눌러 q 가 바뀌어도 React 가 DOM 의 value 를 갱신하지 않아 검색창에
 * 직전 검색어가 그대로 남는다. defaultValue 가 바뀔 때 렌더 중에 상태를 맞춰 이를 막는다.
 */
export default function SearchBar({ defaultValue = '' }: { defaultValue?: string }) {
  const [value, setValue] = useState(defaultValue)
  const [syncedDefault, setSyncedDefault] = useState(defaultValue)
  const inputRef = useRef<HTMLInputElement>(null)

  if (defaultValue !== syncedDefault) {
    setSyncedDefault(defaultValue)
    setValue(defaultValue)
  }

  return (
    <form action="/" method="get" role="search" className="flex gap-2">
      <div className="relative min-w-0 flex-1">
        <MagnifyingGlass
          size={19}
          weight={ICON_WEIGHT}
          aria-hidden
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-dim"
        />
        <input
          ref={inputRef}
          type="search"
          name="q"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="운동 이름을 검색하세요"
          aria-label="운동 이름"
          autoComplete="off"
          enterKeyHint="search"
          className="h-12 w-full rounded-xl border border-border bg-surface pl-11 pr-11 text-[15px] text-text transition-colors placeholder:text-dim hover:border-border-strong focus:border-accent-dim focus:outline-none focus-visible:border-accent-dim [&::-webkit-search-cancel-button]:appearance-none"
        />
        {/*
          이름을 "검색어 지우기" 로 두면 안 된다. 접근성 이름에 '검색'이 들어가는 순간
          제출 버튼과 함께 잡힌다 — getByRole('button', { name: '검색' }) 는 부분 일치다.
        */}
        {value ? (
          <button
            type="button"
            aria-label="입력 지우기"
            onClick={() => {
              setValue('')
              inputRef.current?.focus()
            }}
            className="absolute right-2.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-dim hover:bg-surface3 hover:text-text"
          >
            <X size={14} weight={ICON_WEIGHT} aria-hidden />
          </button>
        ) : null}
      </div>
      <button
        type="submit"
        className="h-12 shrink-0 rounded-xl bg-accent px-5 font-semibold text-accent-fg hover:bg-accent-hover"
      >
        검색
      </button>
    </form>
  )
}
