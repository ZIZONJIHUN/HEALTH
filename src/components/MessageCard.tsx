/**
 * 오류·404 처럼 "상황을 설명하고 빠져나갈 길을 주는" 화면의 공통 껍데기.
 * 세 화면이 각자 카드를 그리면 여백과 색이 조금씩 달라진다.
 */
export default function MessageCard({
  tone = 'neutral',
  icon,
  title,
  description,
  actions,
  testId,
}: {
  tone?: 'neutral' | 'danger'
  icon: React.ReactNode
  title: string
  description: string
  actions?: React.ReactNode
  testId?: string
}) {
  const danger = tone === 'danger'

  return (
    <div
      data-testid={testId}
      className={`w-full max-w-sm rounded-2xl border p-6 text-center ${
        danger ? 'border-danger/35 bg-danger/10' : 'border-border bg-surface'
      }`}
    >
      <div
        className={`mx-auto flex h-11 w-11 items-center justify-center rounded-full ${
          danger ? 'bg-danger/15 text-danger' : 'bg-surface2 text-muted'
        }`}
      >
        {icon}
      </div>

      <p className="mt-4 text-[15px] font-semibold text-text">{title}</p>
      <p className="mt-1 text-sm text-muted">{description}</p>

      {actions ? <div className="mt-5 flex flex-wrap justify-center gap-2">{actions}</div> : null}
    </div>
  )
}
