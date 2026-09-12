import BottomTabBar from '@/components/nav/BottomTabBar'
import TopNav from '@/components/nav/TopNav'

export default function TabsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TopNav />
      {/* pb-28: 모바일 하단 탭바(64px) + 세이프 에어리어에 콘텐츠가 가리지 않게 한다.
          데스크톱에는 탭바가 없으므로 여백을 줄인다. */}
      <main
        id="main"
        className="mx-auto w-full max-w-md px-4 pt-6 pb-28 sm:max-w-2xl sm:px-6 md:max-w-4xl md:pt-10 md:pb-16 lg:max-w-6xl xl:max-w-[1500px]"
      >
        {children}
      </main>
      <BottomTabBar />
    </>
  )
}
