'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  CaretDown,
  CaretUp,
  ICON_WEIGHT,
  ListChecks,
  PencilSimple,
  Play,
  Trash,
} from '@/components/icons'
import { BUTTON_PRIMARY, BUTTON_SECONDARY } from '@/components/styles'
import { formatDuration } from '@/lib/duration'
import {
  deleteRoutine,
  moveVideoInRoutine,
  removeVideoFromRoutine,
  renameRoutine,
  type Routine,
} from '@/lib/routines'
import { useHydrated } from '@/lib/useHydrated'
import { useRoutines } from '@/lib/useRoutines'

export default function RoutineList() {
  const routines = useRoutines()
  // 서버 렌더에는 루틴이 없다. 하이드레이션 전에 "없음" 화면을 그리면 깜빡인다.
  const hydrated = useHydrated()

  if (!hydrated) {
    return (
      <div role="status" aria-label="루틴 불러오는 중" className="space-y-4">
        <div className="skeleton h-40 rounded-2xl" />
        <div className="skeleton h-40 rounded-2xl" />
      </div>
    )
  }

  if (routines.length === 0) {
    return (
      <div
        data-testid="routine-empty"
        className="rounded-2xl border border-border bg-surface p-6 sm:p-8"
      >
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-surface2 text-muted">
          <ListChecks size={22} weight={ICON_WEIGHT} aria-hidden />
        </div>
        <p className="mt-4 text-[15px] font-semibold text-text">아직 만든 루틴이 없어요.</p>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          운동을 검색하고 영상 오른쪽 위의 <span className="font-semibold text-accent">＋</span> 를
          누르면 루틴에 담을 수 있어요.
        </p>
        <Link href="/" className={`${BUTTON_PRIMARY} mt-5`}>
          운동 찾으러 가기
        </Link>
      </div>
    )
  }

  return (
    <ul className="space-y-5">
      {routines.map((routine) => (
        <li key={routine.id}>
          <RoutineCard routine={routine} />
        </li>
      ))}
    </ul>
  )
}

function RoutineCard({ routine }: { routine: Routine }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(routine.name)

  const totalSeconds = routine.items.reduce((sum, item) => sum + item.durationSeconds, 0)

  function commitName() {
    renameRoutine(routine.id, name)
    setEditing(false)
  }

  return (
    <article
      data-testid="routine-card"
      className="rounded-2xl border border-border bg-surface/60 p-4 sm:p-5"
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        {editing ? (
          <div className="flex min-w-0 flex-1 gap-2">
            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commitName()
                if (event.key === 'Escape') {
                  setName(routine.name)
                  setEditing(false)
                }
              }}
              aria-label="루틴 이름"
              className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-surface2 px-3 text-sm text-text focus:border-accent-dim focus:outline-none"
            />
            <button
              type="button"
              onClick={commitName}
              className="h-9 shrink-0 rounded-lg bg-accent px-3 text-xs font-semibold text-accent-fg hover:bg-accent-hover"
            >
              저장
            </button>
          </div>
        ) : (
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="truncate text-lg font-bold tracking-tight">{routine.name}</h2>
            <button
              type="button"
              aria-label={`${routine.name} 이름 바꾸기`}
              onClick={() => setEditing(true)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-dim hover:bg-surface2 hover:text-text"
            >
              <PencilSimple size={13} weight={ICON_WEIGHT} aria-hidden />
            </button>
          </div>
        )}

        <p className="tabular shrink-0 text-xs text-dim">
          {routine.items.length}개 · {formatDuration(totalSeconds)}
        </p>
      </header>

      {routine.items.length === 0 ? (
        <p className="mt-4 rounded-xl border border-border bg-surface px-4 py-5 text-center text-sm text-muted">
          담은 운동이 없어요. 검색 화면에서 ＋ 를 눌러 담아보세요.
        </p>
      ) : (
        <ol className="mt-4 space-y-1.5">
          {routine.items.map((item, index) => (
            <li
              key={item.id}
              data-testid="routine-item"
              className="flex items-center gap-3 rounded-xl border border-border bg-surface px-2.5 py-2"
            >
              <span className="tabular w-5 shrink-0 text-center text-xs text-dim">{index + 1}</span>

              <Link
                href={`/feed?routine=${routine.id}&i=${index}`}
                className="group flex min-w-0 flex-1 items-center gap-3"
              >
                <span className="relative h-12 w-9 shrink-0 overflow-hidden rounded-md bg-surface2">
                  <Image
                    src={item.thumbnailUrl}
                    alt=""
                    fill
                    sizes="36px"
                    className="object-cover transition-transform duration-200 group-hover:scale-105"
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-1 text-[13px] font-medium text-text group-hover:text-accent">
                    {item.title}
                  </span>
                  <span className="tabular mt-0.5 block text-[11px] text-dim">
                    {formatDuration(item.durationSeconds)}
                  </span>
                </span>
              </Link>

              <div className="flex shrink-0 items-center">
                <IconButton
                  label={`${item.title} 위로`}
                  disabled={index === 0}
                  onClick={() => moveVideoInRoutine(routine.id, item.id, -1)}
                >
                  <CaretUp size={13} weight={ICON_WEIGHT} aria-hidden />
                </IconButton>
                <IconButton
                  label={`${item.title} 아래로`}
                  disabled={index === routine.items.length - 1}
                  onClick={() => moveVideoInRoutine(routine.id, item.id, 1)}
                >
                  <CaretDown size={13} weight={ICON_WEIGHT} aria-hidden />
                </IconButton>
                <IconButton
                  label={`${item.title} 빼기`}
                  onClick={() => removeVideoFromRoutine(routine.id, item.id)}
                  danger
                >
                  <Trash size={13} weight={ICON_WEIGHT} aria-hidden />
                </IconButton>
              </div>
            </li>
          ))}
        </ol>
      )}

      <footer className="mt-4 flex flex-wrap gap-2">
        {routine.items.length > 0 ? (
          <Link
            href={`/feed?routine=${routine.id}&i=0`}
            data-testid="start-routine"
            className={BUTTON_PRIMARY}
          >
            <Play size={14} weight="fill" aria-hidden />
            루틴 시작
          </Link>
        ) : null}
        <button
          type="button"
          onClick={() => deleteRoutine(routine.id)}
          className={BUTTON_SECONDARY}
        >
          루틴 삭제
        </button>
      </footer>
    </article>
  )
}

function IconButton({
  label,
  disabled = false,
  danger = false,
  onClick,
  children,
}: {
  label: string
  disabled?: boolean
  danger?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-7 w-7 items-center justify-center rounded-lg text-dim hover:bg-surface2 disabled:pointer-events-none disabled:opacity-30 ${
        danger ? 'hover:text-danger' : 'hover:text-text'
      }`}
    >
      {children}
    </button>
  )
}
