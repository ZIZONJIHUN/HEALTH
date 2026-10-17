import { Barbell, GearSix, ListChecks } from '@/components/ui/icons'

/** Phosphor 아이콘 컴포넌트가 실제로 받는 props 만 추린 것. 패키지 타입에 묶이지 않는다. */
type TabIcon = React.ComponentType<{
  size?: number
  weight?: 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone'
  className?: string
  'aria-hidden'?: boolean
}>

/** 하단 탭바(모바일)와 상단 헤더(데스크톱)가 같은 목록을 쓴다. */
export const TABS: ReadonlyArray<{ href: string; label: string; icon: TabIcon }> = [
  { href: '/', label: '운동', icon: Barbell },
  { href: '/routines', label: '루틴', icon: ListChecks },
  { href: '/account', label: '설정', icon: GearSix },
]
