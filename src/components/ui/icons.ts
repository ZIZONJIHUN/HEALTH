/**
 * Phosphor 아이콘을 여기서만 가져온다.
 *
 * `@phosphor-icons/react` 최상위 배럴은 'use client' 가 붙어 있어 서버 컴포넌트에서 쓰면
 * 아이콘 하나 때문에 클라이언트 경계가 생긴다. `dist/ssr/<이름>` 은 그렇지 않고,
 * 아이콘별 개별 경로라 쓰지 않는 아이콘이 번들에 딸려오지 않는다.
 *
 * 아이콘 패밀리는 Phosphor 하나로 고정하고, weight 는 ICON_WEIGHT 로 통일한다.
 */
export { ArrowClockwise } from '@phosphor-icons/react/dist/ssr/ArrowClockwise'
export { ArrowLeft } from '@phosphor-icons/react/dist/ssr/ArrowLeft'
export { ArrowRight } from '@phosphor-icons/react/dist/ssr/ArrowRight'
export { Barbell } from '@phosphor-icons/react/dist/ssr/Barbell'
export { CaretDown } from '@phosphor-icons/react/dist/ssr/CaretDown'
export { CaretUp } from '@phosphor-icons/react/dist/ssr/CaretUp'
export { Check } from '@phosphor-icons/react/dist/ssr/Check'
export { ListChecks } from '@phosphor-icons/react/dist/ssr/ListChecks'
export { PencilSimple } from '@phosphor-icons/react/dist/ssr/PencilSimple'
export { Plus } from '@phosphor-icons/react/dist/ssr/Plus'
export { Trash } from '@phosphor-icons/react/dist/ssr/Trash'
export { Lightning } from '@phosphor-icons/react/dist/ssr/Lightning'
export { MagnifyingGlass } from '@phosphor-icons/react/dist/ssr/MagnifyingGlass'
export { Play } from '@phosphor-icons/react/dist/ssr/Play'
export { SmileyMeh } from '@phosphor-icons/react/dist/ssr/SmileyMeh'
export { WarningCircle } from '@phosphor-icons/react/dist/ssr/WarningCircle'
export { X } from '@phosphor-icons/react/dist/ssr/X'

/** 프로젝트 전역 아이콘 굵기. 섞어 쓰면 아이콘 세트가 두 개인 것처럼 보인다. */
export const ICON_WEIGHT = 'bold' as const
