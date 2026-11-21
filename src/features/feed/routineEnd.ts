/**
 * 영상이 끝까지 재생됐을 때 루틴을 끝낸 것으로 기록할지.
 *
 * 처음(0번)부터 재생한 경우만 그렇다. 루틴 목록은 운동마다 그 자리로 바로 여는 링크를 두므로,
 * 마지막 운동만 열어 자세를 다시 본 것도 "마지막이 끝났다" 가 된다 — 그걸 기록하면 하지 않은
 * 운동이 연속 기록과 이번 달 횟수에 들어간다. 중간부터 열었으면 '운동 완료' 버튼으로 남긴다.
 */
export function autoCompletesOnEnd(args: {
  routineMode: boolean
  startIndex: number
  index: number
  lastIndex: number
}): boolean {
  return args.routineMode && args.startIndex === 0 && args.index === args.lastIndex
}
