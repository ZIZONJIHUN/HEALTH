const ISO8601_DURATION = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/

/** ISO8601 기간 문자열을 초로 바꾼다. 형식이 아니면 null. */
export function parseIso8601Duration(value: string): number | null {
  const match = ISO8601_DURATION.exec(value)
  if (!match) return null

  const [, days, hours, minutes, seconds] = match
  // "P", "PT" 처럼 숫자가 전혀 없는 값은 기간이 아니다.
  if (!days && !hours && !minutes && !seconds) return null

  return (
    Number(days ?? 0) * 86_400 +
    Number(hours ?? 0) * 3_600 +
    Number(minutes ?? 0) * 60 +
    Number(seconds ?? 0)
  )
}

/** 초를 "M:SS" 로 표시한다. */
export function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const minutes = Math.floor(safe / 60)
  const seconds = safe % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
