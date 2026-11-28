import type { Metadata } from 'next'
import RoutineList from '@/features/routines/RoutineList'
import SyncStatusLine from '@/features/routines/SyncStatusLine'
import WorkoutSummary from '@/features/workouts/WorkoutSummary'

export const metadata: Metadata = {
  title: '내 루틴',
}

export default function RoutinesPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <header>
        <h1 className="text-[26px] font-extrabold tracking-tight sm:text-3xl md:text-[32px]">
          내 루틴
        </h1>
        <p className="mt-2 text-sm text-muted">
          운동을 순서대로 담아두고 한 번에 이어서 볼 수 있어요.
        </p>
        {/* 저장 위치가 기대와 다르면 데이터를 잃은 것처럼 느낀다. 상태를 항상 말해 준다. */}
        <SyncStatusLine />
      </header>

      <div className="mt-7">
        <WorkoutSummary />
      </div>

      <div className="mt-7">
        <RoutineList />
      </div>
    </div>
  )
}
