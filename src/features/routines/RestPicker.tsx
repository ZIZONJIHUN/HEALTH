'use client'

import { chipClass } from '@/components/ui/Chip'
import { iconButtonClass } from '@/components/ui/IconButton'
import { ICON_WEIGHT, Minus, Plus } from '@/components/ui/icons'
import { formatRest, REST, suggestRestSeconds } from '@/features/routines/rest'
import { setItemRest, type RoutineItem } from '@/features/routines/routines'

/**
 * 루틴 화면에서 운동 하나의 휴식 시간을 고르는 줄.
 *
 * 대부분은 프리셋 셋 중 하나를 누르고 끝난다. 세밀한 값이 필요한 사람만 ±10초를 쓴다.
 * "추천"은 저장하지 않고 제목에서 매번 다시 계산한다(rest.ts 주석 참고) — 그래서 사용자가
 * 다른 값을 골라도 어떤 칩이 추천이었는지는 계속 보인다.
 */
/**
 * 칩 글자는 스펙(6.3)이 정한 그대로 쓴다. formatRest(60) 은 "1분" 이지만 칩에서는
 * "30초 · 60초 · 1분 30초" 로 읽혀야 셋이 한 눈금으로 비교된다.
 */
const PRESET_LABEL: Record<(typeof REST.presets)[number], string> = {
  30: '30초',
  60: '60초',
  90: '1분 30초',
}

export default function RestPicker({ routineId, item }: { routineId: string; item: RoutineItem }) {
  const value = item.restSeconds
  const suggested = suggestRestSeconds(item.title)
  const set = (seconds: number) => setItemRest(routineId, item.id, seconds)

  return (
    <div data-testid="rest-picker" className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="text-[11px] font-medium text-dim">휴식</span>

      <div className="flex flex-wrap gap-1.5">
        {REST.presets.map((preset) => {
          const active = value === preset
          return (
            <button
              key={preset}
              type="button"
              aria-pressed={active}
              onClick={() => set(preset)}
              className={chipClass(active, 'sm')}
            >
              {PRESET_LABEL[preset]}
              {preset === suggested ? (
                // 켜진 칩 위에서는 라임 글자가 라임 배경에 묻힌다. 그때만 칩 글자색을 따른다.
                <span className={`ml-1 text-[10px] font-semibold ${active ? '' : 'text-accent'}`}>
                  추천
                </span>
              ) : null}
            </button>
          )
        })}
      </div>

      <div className="flex items-center gap-0.5">
        <button
          type="button"
          aria-label="휴식 10초 줄이기"
          disabled={value <= REST.min}
          onClick={() => set(value - REST.step)}
          className={iconButtonClass('ghost', 'sm')}
        >
          <Minus size={13} weight={ICON_WEIGHT} aria-hidden />
        </button>
        <span className="tabular min-w-14 text-center text-xs font-semibold text-text">
          {formatRest(value)}
        </span>
        <button
          type="button"
          aria-label="휴식 10초 늘리기"
          disabled={value >= REST.max}
          onClick={() => set(value + REST.step)}
          className={iconButtonClass('ghost', 'sm')}
        >
          <Plus size={13} weight={ICON_WEIGHT} aria-hidden />
        </button>
      </div>
    </div>
  )
}
