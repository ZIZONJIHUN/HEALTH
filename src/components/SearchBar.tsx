/** GET 폼이라 자바스크립트 없이도 동작하고, 검색 상태가 URL에 남는다. */
export default function SearchBar({ defaultValue = '' }: { defaultValue?: string }) {
  return (
    <form action="/" method="get" role="search" className="flex gap-2">
      <input
        type="search"
        name="q"
        defaultValue={defaultValue}
        placeholder="운동 이름을 검색하세요"
        aria-label="운동 이름"
        className="h-12 min-w-0 flex-1 rounded-xl border border-border bg-surface px-4 text-text placeholder:text-muted focus:border-accent focus:outline-none"
      />
      <button
        type="submit"
        className="h-12 shrink-0 rounded-xl bg-accent px-5 font-semibold text-bg"
      >
        검색
      </button>
    </form>
  )
}
