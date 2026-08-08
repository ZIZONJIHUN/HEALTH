import BottomTabBar from '@/components/BottomTabBar'

export default function TabsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="mx-auto max-w-md px-4 pb-24 pt-6">{children}</div>
      <BottomTabBar />
    </>
  )
}
