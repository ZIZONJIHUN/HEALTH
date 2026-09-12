/**
 * 한국어 조사 고르기.
 *
 * 사용자가 지은 이름 뒤에 조사를 붙이면 받침에 따라 형태가 달라진다 —
 * "스쿼트**를**", "가슴 루틴**을**". 한쪽으로 고정하면 둘 중 하나는 반드시 틀리고,
 * "을(를)" 처럼 병기하면 읽기 싫은 문장이 된다.
 *
 * 한글 음절은 0xAC00 부터 28개 종성 단위로 배열돼 있어서, 그 나머지가 0이 아니면
 * 받침이 있다.
 */

const HANGUL_START = 0xac00
const HANGUL_END = 0xd7a3
const FINAL_CONSONANT_COUNT = 28

/** 숫자로 끝나는 이름도 자연스럽게 읽히도록 발음 기준 받침 여부를 둔다. */
const DIGIT_HAS_FINAL: Record<string, boolean> = {
  '0': true, // 영
  '1': true, // 일
  '2': false, // 이
  '3': true, // 삼
  '4': false, // 사
  '5': false, // 오
  '6': true, // 육
  '7': true, // 칠
  '8': true, // 팔
  '9': false, // 구
}

function hasFinalConsonant(word: string): boolean {
  const last = word.trim().at(-1)
  if (!last) return false

  if (last in DIGIT_HAS_FINAL) return DIGIT_HAS_FINAL[last]

  const code = last.charCodeAt(0)
  if (code < HANGUL_START || code > HANGUL_END) return false

  return (code - HANGUL_START) % FINAL_CONSONANT_COUNT !== 0
}

/**
 * 받침에 맞는 조사를 고른다.
 * 한글도 숫자도 아닌 글자로 끝나면 받침 없음으로 본다 — 영어 이름에는 어느 쪽도
 * 완벽하지 않고, "를/가/는" 쪽이 덜 어색하다.
 */
export function particle(word: string, withFinal: string, withoutFinal: string): string {
  return hasFinalConsonant(word) ? withFinal : withoutFinal
}
