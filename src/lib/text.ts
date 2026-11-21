/**
 * 코드 포인트 단위로 자른다. slice 는 UTF-16 단위라 경계에 걸린 이모지를 반쪽(외톨이 서로게이트)
 * 으로 남기고, 서버의 char_length 는 코드 포인트를 세므로 길이 판단도 어긋난다.
 * 루틴 이름과 운동 기록의 루틴 이름이 같은 규칙으로 잘려야 해서 여기에 둔다.
 */
export function clampChars(text: string, max: number): string {
  const chars = Array.from(text)
  return chars.length <= max ? text : chars.slice(0, max).join('')
}
