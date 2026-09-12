/**
 * 표면 카드.
 *
 * `rounded-2xl border border-border` 조합이 네 군데(빈 루틴, 빈 검색 결과, 루틴 카드,
 * 인체도 패널)에 흩어져 있었고 배경만 제각각이었다. 배경 차이는 의도가 있다 —
 * 반투명(`/60`)은 뒤 배경이 비쳐 덜 튀어나와 보이고, 목록처럼 여러 개가 늘어서는
 * 자리에 맞는다.
 */

const BASE = 'rounded-2xl border border-border'

export const CARD_TONES = {
  /** 화면에 하나만 있는 카드. 또렷하게. */
  solid: 'bg-surface',
  /** 여러 개가 늘어서는 카드. 반투명이라 덜 무겁다. */
  muted: 'bg-surface/60',
} as const

export type CardTone = keyof typeof CARD_TONES

export function cardClass(tone: CardTone = 'solid', extra = ''): string {
  return `${BASE} ${CARD_TONES[tone]} ${extra}`.trim()
}
