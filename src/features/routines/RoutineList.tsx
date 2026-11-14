'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  ArrowClockwise,
  CaretDown,
  CaretUp,
  ICON_WEIGHT,
  ListChecks,
  PencilSimple,
  Play,
  Trash,
  X,
} from '@/components/ui/icons'
import { BUTTON_PRIMARY, BUTTON_SECONDARY } from '@/components/ui/Button'
import { cardClass } from '@/components/ui/Card'
import { iconButtonClass } from '@/components/ui/IconButton'
import { formatDuration } from '@/lib/duration'
import { particle } from '@/lib/korean'
import {
  deleteRoutine,
  LIMITS,
  moveVideoInRoutine,
  removeVideoFromRoutine,
  renameRoutine,
  restoreRoutine,
  type Routine,
} from '@/features/routines/routines'
import RestPicker from '@/features/routines/RestPicker'
import { useHydrated } from '@/lib/useHydrated'
import { useRoutines } from '@/features/routines/useRoutines'

/** 실행 취소를 띄워 두는 시간. 짧으면 놓치고, 길면 화면에 계속 걸리적거린다. */
const UNDO_WINDOW_MS = 8000

type Deleted = { routine: Routine; index: number; owner: string | null }

export default function RoutineList() {
  const routines = useRoutines()
  // 서버 렌더에는 루틴이 없다. 하이드레이션 전에 "없음" 화면을 그리면 깜빡인다.
  const hydrated = useHydrated()
  const [deleted, setDeleted] = useState<Deleted | null>(null)

  useEffect(() => {
    if (!deleted) return
    const timer = setTimeout(() => setDeleted(null), UNDO_WINDOW_MS)
    return () => clearTimeout(timer)
  }, [deleted])

  if (!hydrated) {
    return (
      <div role="status" aria-label="루틴 불러오는 중" className="space-y-4">
        <div className="skeleton h-40 rounded-2xl" />
        <div className="skeleton h-40 rounded-2xl" />
      </div>
    )
  }

  const undoBar = deleted ? (
    <UndoBar
      name={deleted.routine.name}
      onUndo={() => {
        // 그사이 주인이 바뀌었으면 되돌리기를 거부한다(false). 안내 없이 닫기만 한다 —
        // 지금 화면에는 그 루틴이 원래 없던 것이다.
        restoreRoutine(deleted.routine, deleted.index, deleted.owner)
        setDeleted(null)
      }}
      onDismiss={() => setDeleted(null)}
    />
  ) : null

  if (routines.length === 0) {
    return (
      <>
        <div
          data-testid="routine-empty"
          className={cardClass('solid', 'p-6 sm:p-8')}
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-surface2 text-muted">
            <ListChecks size={22} weight={ICON_WEIGHT} aria-hidden />
          </div>
          <p className="mt-4 text-[15px] font-semibold text-text">아직 만든 루틴이 없어요.</p>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            운동을 검색하고 영상 오른쪽 위의{' '}
            <span className="font-semibold text-accent">＋</span> 를 누르면 루틴에 담을 수 있어요.
          </p>
          <Link href="/" className={`${BUTTON_PRIMARY} mt-5`}>
            운동 찾으러 가기
          </Link>
        </div>
        {/* 마지막 루틴을 지운 직후가 바로 이 화면이다. 되돌릴 길이 여기에도 있어야 한다. */}
        {undoBar}
      </>
    )
  }

  return (
    <>
      <ul className="space-y-5">
        {routines.map((routine) => (
          <li key={routine.id}>
            <RoutineCard routine={routine} onDeleted={setDeleted} />
          </li>
        ))}
      </ul>
      {undoBar}
    </>
  )
}

/**
 * 삭제 직후 뜨는 실행 취소 막대.
 *
 * 토스트가 필요한 곳이 지금 이 하나뿐이라 라이브러리를 넣지 않는다.
 * role="alert" 로 스크린리더에도 즉시 읽히게 한다 — 되돌릴 수 있다는 사실은
 * 시간 제한이 있어서, 나중에 읽히면 의미가 없다.
 */
function UndoBar({
  name,
  onUndo,
  onDismiss,
}: {
  name: string
  onUndo: () => void
  onDismiss: () => void
}) {
  return (
    <div
      role="alert"
      data-testid="undo-delete"
      className="fixed inset-x-0 bottom-0 z-50 mx-auto flex w-full max-w-md items-center gap-3 px-4 pb-20 md:pb-6"
    >
      <div className="flex flex-1 items-center gap-2 rounded-xl border border-border bg-surface2 px-3 py-2.5 shadow-pop">
        {/* 조사를 이름에 붙여 쓴다. 사이에 공백이 들어가면 한국어로 읽히지 않는다. */}
        <p className="min-w-0 flex-1 truncate text-[13px] text-text">
          <span className="font-semibold">{name}</span>
          {particle(name, '을', '를')} 삭제했어요
        </p>
        <button
          type="button"
          onClick={onUndo}
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-semibold text-accent-fg hover:bg-accent-hover"
        >
          <ArrowClockwise size={13} weight={ICON_WEIGHT} aria-hidden />
          실행 취소
        </button>
        <button
          type="button"
          aria-label="닫기"
          onClick={onDismiss}
          className={iconButtonClass('ghost', 'sm')}
        >
          <X size={13} weight={ICON_WEIGHT} aria-hidden />
        </button>
      </div>
    </div>
  )
}

function RoutineCard({
  routine,
  onDeleted,
}: {
  routine: Routine
  onDeleted: (deleted: Deleted) => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(routine.name)
  const [syncedName, setSyncedName] = useState(routine.name)

  /*
    바깥에서 이름이 바뀌면(다른 탭, 실행 취소로 되살아난 루틴) 편집 중이 아닐 때는
    입력값을 따라가게 한다. 초기값으로만 두면 이 입력창이 옛 이름을 들고 있다가
    저장하는 순간 바깥 변경을 되돌려버린다.
    SearchBar 가 defaultValue 에 쓰는 것과 같은 "렌더 중 동기화" 패턴이다.
  */
  if (routine.name !== syncedName) {
    setSyncedName(routine.name)
    if (!editing) setName(routine.name)
  }

  const totalSeconds = routine.items.reduce((sum, item) => sum + item.durationSeconds, 0)

  function commitName() {
    renameRoutine(routine.id, name)
    setEditing(false)
  }

  return (
    <article
      data-testid="routine-card"
      className={cardClass('muted', 'p-4 sm:p-5')}
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
              maxLength={LIMITS.nameLength}
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
              className={iconButtonClass('ghost', 'sm')}
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
              className="rounded-xl border border-border bg-surface px-2.5 py-2"
            >
              <div className="flex items-center gap-3">
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
              </div>
              {/* 번호 칸(w-5) + 간격만큼 들여서 제목 줄과 왼쪽을 맞춘다. */}
              <div className="mt-2 pl-8">
                <RestPicker routineId={routine.id} item={item} />
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
          data-testid="delete-routine"
          onClick={() => {
            const deleted = deleteRoutine(routine.id)
            if (deleted) onDeleted(deleted)
          }}
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
      className={iconButtonClass(danger ? 'danger' : 'ghost', 'sm')}
    >
      {children}
    </button>
  )
}
