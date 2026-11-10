'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Check, ICON_WEIGHT, Plus } from '@/components/ui/icons'
import { addVideoToRoutine, createRoutine, LIMITS } from '@/features/routines/routines'
import { useRoutines } from '@/features/routines/useRoutines'
import type { ShortVideo } from '@/lib/types'

/**
 * 영상을 루틴에 담는다.
 *
 * 그리드에서는 카드 링크 **바깥**에 놓아야 한다. 링크 안에 넣으면 이 버튼을 눌러도
 * 피드로 넘어간다.
 *
 * 두 자리에서 쓴다. 그리드 카드의 오른쪽 위, 그리고 전면 피드의 영상 제목 옆.
 * 피드에서는 버튼이 화면 아래쪽에 있어서 메뉴가 아래로 열리면 화면 밖으로 나간다 —
 * 그래서 여는 방향을 밖에서 정하게 했다. 담기 로직(중복 방지, 새 루틴 만들며 담기,
 * 저장 실패 처리)은 한 벌만 두고 양쪽이 같이 쓴다.
 */
export default function AddToRoutineButton({
  video,
  placement = 'below',
  className = 'absolute top-1.5 right-1.5 z-10',
}: {
  video: ShortVideo
  /** 메뉴가 열리는 방향. 버튼이 화면 아래쪽에 있으면 'above'. */
  placement?: 'below' | 'above'
  /** 바깥 컨테이너의 위치 지정. 기본값은 그리드 카드 기준 절대 배치다. */
  className?: string
}) {
  // 메뉴와 실패 안내가 같은 방향으로 열려야 한다.
  const openSide = placement === 'above' ? 'bottom-9' : 'top-9'
  const routines = useRoutines()
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [justAdded, setJustAdded] = useState(false)
  // 담기지 않은 이유. null 이면 안내를 띄우지 않는다.
  const [failed, setFailed] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  const savedIn = routines.filter((routine) =>
    routine.items.some((item) => item.id === video.id),
  )

  useEffect(() => {
    if (!open) return

    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  useEffect(() => {
    if (!justAdded) return
    const timer = setTimeout(() => setJustAdded(false), 1600)
    return () => clearTimeout(timer)
  }, [justAdded])

  useEffect(() => {
    if (!failed) return
    // 실패 안내는 성공 피드백보다 오래 띄운다. 읽고 무슨 일인지 이해할 시간이 필요하다.
    const timer = setTimeout(() => setFailed(null), 4000)
    return () => clearTimeout(timer)
  }, [failed])

  function add(routineId: string) {
    // 저장 실패(용량 초과, 시크릿 모드)를 삼키면 화면에는 담긴 것처럼 보이고
    // 새로고침하면 사라진다. 사용자는 이유를 알 수 없다.
    const result = addVideoToRoutine(routineId, video)
    setFailed(
      result === 'failed'
        ? '저장하지 못했어요. 브라우저 저장공간이 가득 찼을 수 있어요.'
        : result === 'full'
          ? `한 루틴에는 ${LIMITS.items}개까지 담을 수 있어요`
          : null,
    )
    setJustAdded(result === 'added' || result === 'duplicate')
    close()
  }

  function close() {
    setOpen(false)
    setCreating(false)
  }

  function createAndAdd(name: string) {
    const routine = createRoutine(name)
    if (!routine) {
      // 상한은 실패 안내와 같은 자리에 같은 시간 동안 띄운다. 이유가 다를 뿐 "담기지 않았다"는 같다.
      setFailed(`루틴은 ${LIMITS.routines}개까지 만들 수 있어요`)
      setJustAdded(false)
      close()
      return
    }
    add(routine.id)
  }

  return (
    <div ref={containerRef} className={className}>
      <button
        type="button"
        data-testid="add-to-routine"
        aria-label={savedIn.length ? `${video.title} 담긴 루틴 바꾸기` : `${video.title} 루틴에 담기`}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        className={`flex h-8 w-8 items-center justify-center rounded-full border backdrop-blur-md ${
          savedIn.length
            ? 'border-accent-dim bg-accent text-accent-fg'
            : 'border-white/15 bg-black/55 text-text hover:border-accent-dim hover:text-accent'
        }`}
      >
        {savedIn.length || justAdded ? (
          <Check size={15} weight={ICON_WEIGHT} aria-hidden />
        ) : (
          <Plus size={15} weight={ICON_WEIGHT} aria-hidden />
        )}
      </button>

      {open ? (
        /*
          role="menu" 을 쓰면 안 된다. menu 의 자식은 menuitem 계열이어야 하는데
          여기에는 "새 루틴 이름" 입력창이 들어간다. 역할을 붙이지 않고 평범한
          버튼 묶음으로 두는 편이 스크린리더에 더 정확하다.
        */
        <div
          id={menuId}
          aria-label="루틴에 담기"
          className={`absolute ${openSide} right-0 z-30 w-52 rounded-xl border border-border bg-surface p-1.5 shadow-pop`}
        >
          {routines.length === 0 && !creating ? (
            <p className="px-2 py-2 text-xs leading-relaxed text-dim">
              아직 루틴이 없어요.
              <br />
              첫 루틴을 만들어 담아보세요.
            </p>
          ) : null}

          <ul className="max-h-56 overflow-y-auto">
            {routines.map((routine) => {
              const contains = routine.items.some((item) => item.id === video.id)
              return (
                <li key={routine.id}>
                  <button
                    type="button"
                    disabled={contains}
                    onClick={() => add(routine.id)}
                    className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-text hover:bg-surface2 disabled:text-dim disabled:hover:bg-transparent"
                  >
                    <span className="truncate">{routine.name}</span>
                    {contains ? (
                      <span className="shrink-0 text-[11px] text-accent-dim">담김</span>
                    ) : (
                      <span className="tabular shrink-0 text-[11px] text-dim">
                        {routine.items.length}
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>

          {creating ? (
            <NewRoutineForm onCancel={() => setCreating(false)} onSubmit={createAndAdd} />
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="mt-1 flex w-full items-center gap-1.5 rounded-lg border-t border-border px-2.5 py-2 text-[13px] font-medium text-accent hover:bg-surface2"
            >
              <Plus size={13} weight={ICON_WEIGHT} aria-hidden />새 루틴 만들기
            </button>
          )}
        </div>
      ) : null}

      {failed ? (
        <p
          role="alert"
          data-testid="add-failed"
          className={`absolute ${openSide} right-0 z-30 w-44 rounded-lg border border-danger/35 bg-danger/15 px-2.5 py-2 text-[11px] leading-relaxed text-text shadow-pop`}
        >
          {failed}
        </p>
      ) : null}
    </div>
  )
}

function NewRoutineForm({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void
  onSubmit: (name: string) => void
}) {
  const [name, setName] = useState('')

  return (
    // 카드가 <form> 안에 있는 경우는 없지만, 검색 폼과 중첩되지 않도록 form 대신 div 를 쓴다.
    <div className="mt-1 border-t border-border p-1.5">
      <input
        autoFocus
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onSubmit(name || '내 루틴')
          if (event.key === 'Escape') onCancel()
        }}
        maxLength={LIMITS.nameLength}
        placeholder="예: 가슴 루틴"
        aria-label="새 루틴 이름"
        className="h-9 w-full rounded-lg border border-border bg-surface2 px-2.5 text-[13px] text-text placeholder:text-dim focus:border-accent-dim focus:outline-none"
      />
      <div className="mt-1.5 flex gap-1.5">
        <button
          type="button"
          onClick={() => onSubmit(name || '내 루틴')}
          className="h-8 flex-1 rounded-lg bg-accent text-xs font-semibold text-accent-fg hover:bg-accent-hover"
        >
          만들고 담기
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="h-8 rounded-lg border border-border px-3 text-xs text-muted hover:bg-surface2 hover:text-text"
        >
          취소
        </button>
      </div>
    </div>
  )
}
