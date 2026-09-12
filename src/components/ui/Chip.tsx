/**
 * 알약 모양 링크.
 *
 * 정리 전에는 세 군데(부위 칩, 인기 운동, 빈 화면 추천)가 각자 클래스를 들고 있었고
 * 크기·모서리·hover 가 조금씩 달랐다. 세 곳 모두 "눌러서 검색어를 바꾼다"는 같은
 * 일을 하는데 모양이 다를 이유가 없다.
 *
 * 크기 둘은 남긴다 — `sm` 은 상위 칩 아래 열리는 세부 줄이라 한 단계 작아야 계층이 보인다.
 */

const BASE = 'inline-flex items-center rounded-full border font-medium'

export const CHIP_SIZES = {
  sm: 'h-8 px-3.5 text-[13px]',
  md: 'h-9 px-4 text-sm',
} as const

export type ChipSize = keyof typeof CHIP_SIZES

const IDLE =
  'border-border bg-surface2 text-muted hover:border-border-strong hover:bg-surface3 hover:text-text'

const ACTIVE = 'border-transparent bg-accent text-accent-fg'

export function chipClass(active = false, size: ChipSize = 'md'): string {
  return `${BASE} ${CHIP_SIZES[size]} ${active ? ACTIVE : IDLE}`
}
