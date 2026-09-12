/**
 * 아이콘만 있는 버튼.
 *
 * 정리 전에는 이 모양이 **여섯 군데에 흩어져** 있었고 서로 어긋나 있었다 —
 * 크기가 h-7 / h-8 / h-10 / h-11 네 가지였고, 같은 "흐릿한 고스트" 버튼인데도
 * hover 배경이 어떤 곳은 `surface2`, 어떤 곳은 `surface3` 였다.
 *
 * 크기는 셋으로 남긴다. 줄이지 않는 이유가 있다 — 28px 은 루틴 항목처럼 촘촘한 줄
 * 안에 들어가야 하고, 44px 은 영상 위에 떠 있어 손가락으로 눌러야 한다. 같은 값으로
 * 만들면 한쪽이 반드시 나빠진다.
 *
 * hover 배경은 `surface2` 로 통일했다. 두 값이 섞여 있을 이유가 없었고, 넷 중 둘이
 * 이미 이 값이었다.
 */

const BASE = 'flex shrink-0 items-center justify-center disabled:pointer-events-none disabled:opacity-30'

export const ICON_BUTTON_SIZES = {
  /** 촘촘한 줄 안. 루틴 항목 조작, 입력창 지우기, 패널 닫기. */
  sm: 'h-7 w-7',
  /** 떠 있는 단독 컨트롤. 뒤로가기. */
  md: 'h-10 w-10',
  /** 영상 위 주요 컨트롤. 손가락 목표 크기를 지킨다. */
  lg: 'h-11 w-11',
} as const

export const ICON_BUTTON_TONES = {
  /** 배경 없이 흐릿하게. 곁다리 동작. */
  ghost: 'text-dim hover:bg-surface2 hover:text-text',
  /** 지우는 동작. hover 에서만 위험색을 드러낸다. */
  danger: 'text-dim hover:bg-surface2 hover:text-danger',
  /** 어두운 영상 위. 배경과 분리되려면 자기 배경이 필요하다. */
  overlay:
    'border border-white/10 bg-black/50 text-text backdrop-blur-md hover:border-accent-dim hover:bg-black/70 hover:text-accent',
} as const

export type IconButtonSize = keyof typeof ICON_BUTTON_SIZES
export type IconButtonTone = keyof typeof ICON_BUTTON_TONES

export function iconButtonClass(
  tone: IconButtonTone = 'ghost',
  size: IconButtonSize = 'sm',
  extra = '',
): string {
  // 모서리는 원형 하나로 통일한다. 여섯 중 다섯이 이미 원형이었고, 정사각형에 가까운
  // 버튼에서 rounded-lg 와 rounded-full 이 섞이면 같은 줄에서 눈에 띄게 어긋난다.
  return `${BASE} ${ICON_BUTTON_SIZES[size]} rounded-full ${ICON_BUTTON_TONES[tone]} ${extra}`.trim()
}
