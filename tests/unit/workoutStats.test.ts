import { describe, expect, it } from 'vitest'
import type { WorkoutLog } from '@/features/workouts/workouts'
import { toLocalDate, workoutStats } from '@/features/workouts/stats'

let seq = 0
function log(localDate: string, over: Partial<WorkoutLog> = {}): WorkoutLog {
  seq += 1
  return {
    id: `w${seq}`,
    routineId: 'r1',
    routineName: '하체',
    completedAt: Date.parse(`${localDate}T12:00:00`),
    localDate,
    owner: null,
    dirty: false,
    ...over,
  }
}

// 2026-11-12 는 목요일이다.
const thursday = new Date(2026, 10, 12, 9, 0)

describe('toLocalDate', () => {
  it('기기 현지 날짜 구성요소로 YYYY-MM-DD 를 만든다', () => {
    expect(toLocalDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
    expect(toLocalDate(new Date(2026, 10, 12, 0, 0))).toBe('2026-11-12')
  })
})

describe('workoutStats', () => {
  it('주는 월요일부터 7칸이다', () => {
    const { week } = workoutStats([], thursday)
    expect(week.map((d) => d.date)).toEqual([
      '2026-11-09',
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
      '2026-11-14',
      '2026-11-15',
    ])
    expect(week.map((d) => d.isToday)).toEqual([false, false, false, true, false, false, false])
    expect(week.every((d) => !d.done)).toBe(true)
  })

  it('오늘 안 했어도 어제까지 이어지면 연속이다', () => {
    const logs = [log('2026-11-09'), log('2026-11-10'), log('2026-11-11')]
    const stats = workoutStats(logs, thursday)
    expect(stats.streak).toBe(3)
    expect(stats.week.map((d) => d.done)).toEqual([true, true, true, false, false, false, false])
  })

  it('오늘도 했으면 오늘까지 센다', () => {
    const logs = [log('2026-11-11'), log('2026-11-12')]
    expect(workoutStats(logs, thursday).streak).toBe(2)
  })

  it('하루 빠지면 끊긴다', () => {
    // 오늘(12일)도 어제(11일)도 없으면 그 전 기록이 있어도 0 이다.
    expect(workoutStats([log('2026-11-08'), log('2026-11-10')], thursday).streak).toBe(0)
    // 어제는 했지만 그제(10일)가 비었으면 어제 하루만 센다.
    expect(
      workoutStats([log('2026-11-08'), log('2026-11-09'), log('2026-11-11')], thursday).streak,
    ).toBe(1)
  })

  it('하루 여러 번은 연속 하루, 이번 달 횟수는 건수다', () => {
    const logs = [log('2026-11-11'), log('2026-11-11'), log('2026-11-11')]
    const stats = workoutStats(logs, thursday)
    expect(stats.streak).toBe(1)
    expect(stats.monthCount).toBe(3)
  })

  it('일요일 밤 기록은 그 주에 들어간다', () => {
    // 일요일은 getDay() 가 0 이라, 월요일 시작 계산을 잘못하면 다음 주로 넘어간다.
    const sundayNight = new Date(2026, 10, 15, 23, 59)
    const stats = workoutStats([log(toLocalDate(sundayNight))], sundayNight)
    expect(stats.week[0].date).toBe('2026-11-09')
    expect(stats.week[6]).toEqual({ date: '2026-11-15', done: true, isToday: true })
  })

  it('월이 바뀌면 이번 달 횟수는 새로 센다', () => {
    const stats = workoutStats([log('2026-10-31')], new Date(2026, 10, 1, 8, 0))
    expect(stats.monthCount).toBe(0)
    expect(stats.streak).toBe(1)
  })

  it('연속 일수는 월 경계를 넘어 센다', () => {
    const logs = [log('2026-10-30'), log('2026-10-31'), log('2026-11-01')]
    expect(workoutStats(logs, new Date(2026, 10, 1)).streak).toBe(3)
  })

  it('다른 해의 같은 달은 이번 달에 들지 않는다', () => {
    expect(workoutStats([log('2025-11-12')], thursday).monthCount).toBe(0)
  })
})
