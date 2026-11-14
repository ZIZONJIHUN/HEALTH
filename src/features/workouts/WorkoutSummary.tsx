'use client'

import { cardClass } from '@/components/ui/Card'
import { useHydrated } from '@/lib/useHydrated'
import { workoutStats } from './stats'
import { useWorkouts } from './useWorkouts'

/** stats.week 는 월요일부터 7칸이다. */
const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'] as const

/**
 * 루틴 화면 맨 위의 이번 주 기록.
 *
 * 기록은 localStorage 에만 있어 서버 렌더에서는 늘 "없음"이다. 하이드레이션 전에 그리면 기록이
 * 있는 사용자에게도 안내 문구가 한 프레임 번쩍이므로, 그때는 아무것도 그리지 않는다.
 */
export default function WorkoutSummary() {
  const hydrated = useHydrated()
  const logs = useWorkouts()

  if (!hydrated) return null

  if (logs.length === 0) {
    return <p className="text-sm text-muted">루틴을 끝까지 하면 여기에 기록돼요.</p>
  }

  // 날짜는 렌더 때마다 새로 잡는다 — 자정을 넘겨 열어 둔 화면도 다음 렌더에서 오늘이 바뀐다.
  const { week, streak, monthCount } = workoutStats(logs, new Date())

  return (
    <section data-testid="workout-summary" className={cardClass('solid', 'p-4')}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-text">이번 주</h2>
        <p className="tabular text-xs text-muted">
          <span className="font-semibold text-accent">연속 {streak}일</span>
          <span aria-hidden className="mx-1.5 text-dim">
            ·
          </span>
          이번 달 {monthCount}회
        </p>
      </div>

      <ol className="mt-3 grid grid-cols-7 gap-1.5">
        {week.map((day, i) => (
          <li key={day.date} className="flex flex-col items-center gap-1.5">
            <span
              aria-hidden
              className={`text-[11px] font-medium ${day.isToday ? 'text-text' : 'text-dim'}`}
            >
              {WEEKDAYS[i]}
            </span>
            {/* 운동한 날은 라임으로 채우고, 오늘은 테두리로만 짚는다 — 채움과 겹쳐도 둘 다 읽혀야 한다. */}
            <span
              className={`block aspect-square w-full max-w-9 rounded-lg ${
                day.done ? 'bg-accent' : 'bg-surface2'
              } ${day.isToday ? 'ring-2 ring-accent-dim ring-offset-2 ring-offset-surface' : ''}`}
            >
              <span className="sr-only">
                {WEEKDAYS[i]}요일{day.isToday ? '(오늘)' : ''} {day.done ? '운동함' : '쉼'}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}
