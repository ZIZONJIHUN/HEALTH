import BottomTabBar from '@/components/BottomTabBar'
import TopNav from '@/components/TopNav'

export default function TabsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TopNav />
      {/* pb-28: 모바일 하단 탭바(64px) + 세이프 에어리어에 콘텐츠가 가리지 않게 한다.
          데스크톱에는 탭바가 없으므로 여백을 줄인다. */}
      <main
        id="main"
        className="mx-auto w-full max-w-md px-4 pb-28 pt-6 sm:max-w-2xl sm:px-6 md:max-w-4xl md:pb-16 md:pt-10 lg:max-w-5xl xl:max-w-6xl"
      >
        {children}
      </main>
      <BottomTabBar />
    </>
  )
}
