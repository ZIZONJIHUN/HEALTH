import type { WorkoutLog } from './workouts'

/**
 * 운동 기록 통계. 순수 함수다 — 저장소를 모르고 넘겨받은 기록만 센다. 그래야 주·월 경계와
 * 연속 일수 규칙을 날짜만 바꿔 가며 검증할 수 있다. 호출하는 쪽이 loadWorkouts() 를 넘긴다.
 *
 * 날짜는 전부 기록의 localDate(기기 달력 날짜) 로 비교한다. completedAt 을 쓰면 자정 근처나
 * 시간대가 다른 기기의 기록이 사용자가 느낀 날과 다른 날로 세어진다.
 */

export type WorkoutStats = {
  week: { date: string; done: boolean; isToday: boolean }[]
  streak: number
  monthCount: number
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/**
 * 기기 현지 날짜를 YYYY-MM-DD 로. toISOString 은 UTC 라서 한국에서 오전 9시 전 기록이
 * 전날로 잘린다.
 */
export function toLocalDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** 날짜에 일수를 더한다. 달력 구성요소로 만들어야 서머타임이 있는 시간대에서도 하루가 하루다. */
function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

export function workoutStats(logs: WorkoutLog[], today: Date): WorkoutStats {
  const days = new Set(logs.map((log) => log.localDate))
  const todayKey = toLocalDate(today)

  // getDay() 는 일요일이 0 이다. 월요일 시작이므로 일요일은 6일 전 월요일의 주에 든다.
  const monday = addDays(today, -((today.getDay() + 6) % 7))
  const week = Array.from({ length: 7 }, (_, i) => {
    const date = toLocalDate(addDays(monday, i))
    return { date, done: days.has(date), isToday: date === todayKey }
  })

  // 오늘 아직 안 했어도 하루가 끝난 게 아니므로, 어제까지 이어졌으면 끊긴 것으로 보지 않는다.
  let cursor = days.has(todayKey) ? today : addDays(today, -1)
  let streak = 0
  while (days.has(toLocalDate(cursor))) {
    streak += 1
    cursor = addDays(cursor, -1)
  }

  // 이번 달은 날 수가 아니라 건수다 — 하루 두 번 한 것도 두 번 한 것이다.
  const monthPrefix = todayKey.slice(0, 8)
  const monthCount = logs.filter((log) => log.localDate.startsWith(monthPrefix)).length

  return { week, streak, monthCount }
}
