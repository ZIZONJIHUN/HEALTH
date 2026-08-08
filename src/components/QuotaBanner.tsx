import { ICON_WEIGHT, WarningCircle } from '@/components/icons'

export default function QuotaBanner() {
  return (
    <div
      data-testid="quota-banner"
      role="status"
      className="flex items-start gap-3 rounded-xl border border-danger/35 bg-danger/10 px-4 py-3"
    >
      <WarningCircle
        size={18}
        weight={ICON_WEIGHT}
        aria-hidden
        className="mt-px shrink-0 text-danger"
      />
      <p className="text-[13px] leading-relaxed text-text">
        검색 한도에 걸렸어요. 이미 찾아둔 운동은 계속 볼 수 있습니다.
      </p>
    </div>
  )
}
